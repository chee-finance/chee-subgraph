/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { Market, Comptroller } from '../types/schema'
import { PriceOracle2 } from '../types/templates/CToken/PriceOracle2'
import { BEP20 } from '../types/templates/CToken/BEP20'
import { CToken } from '../types/templates/CToken/CToken'

import {
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  cTokenDecimalsBD,
  zeroBD,
} from './helpers'

let vUSDCAddress = '0x0000000000000000000000000000000000000000'
let cBNBAddress = '0x76e51f355eb570b815118ab38276d5efef1acbd7' // lowercase

// Used for all cBEP20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let underlyingPrice: BigDecimal

  /* PriceOracle2 is used from starting of Comptroller.
   * This must use the cToken address.
   *
   * Note this returns the value without factoring in token decimals and wei, so we must divide
   * the number by (bnbDecimals - tokenDecimals) and again by the mantissa.
   */
  let mantissaDecimalFactor = 18 - underlyingDecimals + 18
  let bdFactor = exponentToBigDecimal(mantissaDecimalFactor)
  let oracle2 = PriceOracle2.bind(oracleAddress)
  let tokenPrice = oracle2.try_getUnderlyingPrice(eventAddress)
  let tokenPriceDecimal = tokenPrice.reverted
    ? BigDecimal.fromString('0')
    : tokenPrice.value.toBigDecimal().div(bdFactor)
  // underlyingPrice = oracle2
  //   .getUnderlyingPrice(eventAddress)
  //   .toBigDecimal()
  //   .div(bdFactor)

  // return underlyingPrice

  return tokenPriceDecimal
}

export function createMarket(marketAddress: string, blockNumber: BigInt): Market {
  let market: Market
  let contract = CToken.bind(Address.fromString(marketAddress))

  // It is cBNB, which has a slightly different interface
  if (marketAddress == cBNBAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18
    market.underlyingPrice = BigDecimal.fromString('1')
    market.underlyingName = 'Binance Coin'
    market.underlyingSymbol = 'BNB'
    market.underlyingPriceUSD = zeroBD
    // It is all other CBEP20 contracts
  } else {
    market = new Market(marketAddress)
    let underlyingAddress =
      marketAddress == '0x02051bf562d7490fe677d55d2603241ad338dbde'
        ? Address.fromString('0xc680160d4C5B4683cB53EF4D5bFF572FA4B68eE2')
        : contract.underlying()
    market.underlyingAddress = underlyingAddress
    let underlyingContract = BEP20.bind(market.underlyingAddress as Address)
    market.underlyingDecimals = underlyingContract.decimals()
    market.underlyingName = underlyingContract.name()
    market.underlyingSymbol = underlyingContract.symbol()
    market.underlyingPriceUSD = zeroBD
    market.underlyingPrice = zeroBD
    if (marketAddress == vUSDCAddress) {
      market.underlyingPriceUSD = BigDecimal.fromString('1')
    }
  }

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()

  market.borrowRate = zeroBD
  market.cash = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted
    ? Address.fromString('0x0000000000000000000000000000000000000000')
    : interestRateModelAddress.value
  market.name = contract.name()
  market.reserves = zeroBD
  market.supplyRate = zeroBD
  market.symbol = contract.symbol()
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD

  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD
  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0) : reserveFactor.value

  return market
}

function getBNBinUSD(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let oracle = PriceOracle2.bind(oracleAddress)
  let bnbPrice = oracle.try_getUnderlyingPrice(Address.fromString(cBNBAddress))
  let bnbPriceDecimal = bnbPrice.reverted
    ? BigDecimal.fromString('1')
    : bnbPrice.value.toBigDecimal().div(mantissaFactorBD)
  // let bnbPriceInUSD = oracle
  //   .getUnderlyingPrice(Address.fromString(cBNBAddress))
  //   .toBigDecimal()
  //   .div(mantissaFactorBD)
  // return bnbPriceInUSD
  return bnbPriceDecimal
}

export function updateMarket(
  marketAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32,
): Market {
  let marketID = marketAddress.toHexString()
  let market = Market.load(marketID)
  if (market == null) {
    market = createMarket(marketID, BigInt.fromI32(blockNumber))
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {
    let contractAddress = Address.fromString(market.id)
    let contract = CToken.bind(contractAddress)

    let bnbPriceInUSD = getBNBinUSD(blockNumber)

    // if cBNB, we only update USD price
    if (market.id == cBNBAddress) {
      market.underlyingPriceUSD = bnbPriceInUSD.truncate(market.underlyingDecimals)
    } else {
      let tokenPriceUSD = getTokenPrice(
        blockNumber,
        contractAddress,
        market.underlyingAddress as Address,
        market.underlyingDecimals,
      )
      market.underlyingPrice = tokenPriceUSD
        .div(bnbPriceInUSD)
        .truncate(market.underlyingDecimals)
      // if USDC, we only update BNB price
      if (market.id != vUSDCAddress) {
        market.underlyingPriceUSD = tokenPriceUSD.truncate(market.underlyingDecimals)
      }
    }

    market.accrualBlockNumber = contract.accrualBlockNumber().toI32()
    market.blockTimestamp = blockTimestamp
    market.totalSupply = contract
      .totalSupply()
      .toBigDecimal()
      .div(cTokenDecimalsBD)

    /* Exchange rate explanation
       In Practice
        - If you call the vDAI contract on bscscan it comes back (2.0 * 10^26)
        - If you call the vUSDC contract on bscscan it comes back (2.0 * 10^14)
        - The real value is ~0.02. So vDAI is off by 10^28, and vUSDC 10^16
       How to calculate for tokens with different decimals
        - Must div by tokenDecimals, 10^market.underlyingDecimals
        - Must multiply by ctokenDecimals, 10^8
        - Must div by mantissa, 10^18
     */
    market.exchangeRate = contract
      .exchangeRateStored()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .times(cTokenDecimalsBD)
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    market.borrowIndex = contract
      .borrowIndex()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.reserves = contract
      .totalReserves()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.totalBorrows = contract
      .totalBorrows()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)
    market.cash = contract
      .getCash()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Chee Solidity
    market.borrowRate = contract
      .borrowRatePerBlock()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let supplyRatePerBlock = contract.try_supplyRatePerBlock()
    if (supplyRatePerBlock.reverted) {
      log.info('***CALL FAILED*** : cBEP20 supplyRatePerBlock() reverted', [])
      market.supplyRate = zeroBD
    } else {
      market.supplyRate = supplyRatePerBlock.value
        .toBigDecimal()
        .div(mantissaFactorBD)
        .truncate(mantissaFactor)
    }
    market.save()
  }
  return market as Market
}
