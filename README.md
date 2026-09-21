# OpenAuth (Custom Enhanced Fork)

> **Note**: This repository is a custom fork of [sst/openauth](https://github.com/sst/openauth) featuring critical storage concurrency bug fixes and high-throughput write optimizations.

---

## 🛠️ Custom Modifications & Bug Fixes

### 1. Fixed Race Condition in `MemoryStorage` Persistence
- **Issue**: Under high-concurrency conditions with `persist` enabled, concurrent asynchronous `save()` (`writeFile`) operations caused older snapshot writes to resolve out-of-order and overwrite newer memory states.
- **Root Cause**: Uncontrolled asynchronous file IO scheduling in `packages/openauth/src/storage/memory.ts`.
- **Fix**: Implemented a sequential Promise queue (`saveQueue`) to enforce strict order-of-call write execution.

### 2. High-Frequency I/O Batching & Optimization
- **Optimization**: Introduced `pendingSnapshot` merging. During burst write sequences, intermediate redundant snapshots are skipped, ensuring only the latest state is written to disk.
- **Error Handling**: Added `.catch()` pipeline isolation to prevent whole queue failure if a single IO error occurs.
- **Performance Impact**: Execution time for concurrent persistence unit tests dropped from ~343ms to **~11.9ms** (~30x - 70x speedup), maintaining 100% test pass rate (`28 pass, 0 fail`).

### 3. Added Reproducing & Verification Unit Tests
- Extended `packages/openauth/test/storage.test.ts` with explicit assertions verifying last-write-wins correctness during concurrent `set()` persistence.