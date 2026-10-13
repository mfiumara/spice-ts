#!/usr/bin/env bash
# Pinned upstream serial source-build recipe. Not yet exercised on Linux.
# Prerequisites on Ubuntu: cmake ninja-build g++ bison flex libblas-dev liblapack-dev git.
# Run via spice-heavy; JOBS defaults to two on the shared host.
set -euo pipefail
root=${1:?Usage: build-xyce-serial.sh ABSOLUTE_BUILD_ROOT}
case "$root" in /*) ;; *) printf 'Build root must be absolute\n' >&2; exit 2 ;; esac
jobs=${JOBS:-2}
mkdir -p "$root"
fetch() {
  local repo=$1 name=$2 revision=$3
  if [ ! -d "$root/$name/.git" ]; then
    git init "$root/$name"
    git -C "$root/$name" remote add origin "$repo"
    git -C "$root/$name" fetch --depth=1 origin "$revision"
    git -C "$root/$name" checkout --detach FETCH_HEAD
  fi
  test "$(git -C "$root/$name" rev-parse HEAD)" = "$revision"
  test -z "$(git -C "$root/$name" status --porcelain)"
}
fetch https://github.com/DrTimothyAldenDavis/SuiteSparse.git suitesparse d3c4926d2c47fd6ae558e898bfc072ade210a2a1
fetch https://github.com/trilinos/Trilinos.git trilinos 975307431d60d0859ebaa27c9169cbb1d4287513
fetch https://github.com/Xyce/Xyce.git xyce a592a42ae7472151d1c8e3bca0ca62d27476f2f3
prefix="$root/install"
cmake -G Ninja -S "$root/suitesparse" -B "$root/ss-build" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DSUITESPARSE_ENABLE_PROJECTS='suitesparse_config;amd'
cmake --build "$root/ss-build" -j "$jobs" --target install
cmake -G Ninja -S "$root/trilinos" -B "$root/trilinos-build" \
  -C "$root/xyce/cmake/trilinos/trilinos-base.cmake" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="$prefix" -DCMAKE_PREFIX_PATH="$prefix" \
  -DTrilinos_ENABLE_Fortran=OFF -DTPL_ENABLE_MPI=OFF \
  -DAMD_LIBRARY_DIRS="$prefix/lib" -DAMD_INCLUDE_DIRS="$prefix/include"
cmake --build "$root/trilinos-build" -j "$jobs" --target install
cmake -G Ninja -S "$root/xyce" -B "$root/xyce-build" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix" \
  -DCMAKE_PREFIX_PATH="$prefix" -DTrilinos_ROOT="$prefix"
cmake --build "$root/xyce-build" -j "$jobs" --target install
"$prefix/bin/Xyce" -v
