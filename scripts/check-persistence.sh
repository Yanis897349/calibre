#!/bin/sh
# Use an isolated disposable database: this script never deletes application data.
set -eu
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable PostgreSQL database}"
cargo test --manifest-path backend/Cargo.toml persistence_round_trip -- --ignored
