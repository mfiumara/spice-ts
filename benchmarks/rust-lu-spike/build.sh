#!/usr/bin/env bash
# Issue #802 spike: build the Rust LU (pure binary, napi addon, wasm-bindgen
# WASM). Needs only rustup/cargo + the wasm-bindgen CLI matching the pinned
# crate (0.2.128): `rustup target add wasm32-unknown-unknown` and
# `cargo install wasm-bindgen-cli --version 0.2.128`.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root/rust"
cargo build --release -p spice-lu -p spice-lu-node
RUSTFLAGS="-C target-feature=+simd128" \
  cargo build --release --target wasm32-unknown-unknown -p spice-lu-wasm
wasm-bindgen --target nodejs --out-dir target/wasm-pkg \
  target/wasm32-unknown-unknown/release/spice_lu_wasm.wasm
case "$(uname)" in
  Darwin) lib=target/release/libspice_lu_node.dylib ;;
  Linux) lib=target/release/libspice_lu_node.so ;;
  *) lib=target/release/spice_lu_node.dll ;;
esac
cp "$lib" target/spice_lu_node.node
echo "built: rust/target/release/spice-lu-bench, rust/target/spice_lu_node.node, rust/target/wasm-pkg/"
