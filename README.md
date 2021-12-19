# Chee-Subgraph

[Chee](https://chee.io/) is an open-source protocol for algorithmic, efficient Money Markets on the Binance Smart Chain. This Subgraph ingests the contracts of Chee protocol.

## Networks and Performance

This subgraph can be found on The Graph Hosted Service at https://thegraph.com/explorer/subgraph/cheeprotocol/chee-subgraph.

You can also run this subgraph locally, if you wish. Instructions for that can be found in [The Graph Documentation](https://thegraph.com/docs/quick-start).

### ABI

The ABI used is `ctoken.json`. It is a stripped down version of the full abi provided by Chee, that satisfies the calls we need to make for both cCELO and cBEP20 contracts. This way we can use 1 ABI file, and one mapping for cCELO and cBEP20.

## Getting started with querying

Below are a few ways to show how to query the Chee V2 Subgraph for data. The queries show most of the information that is queryable, but there are many other filtering options that can be used, just check out the [querying api](https://github.com/graphprotocol/graph-node/blob/master/docs/graphql-api.md).

You can also see the saved queries on the hosted service for examples.
