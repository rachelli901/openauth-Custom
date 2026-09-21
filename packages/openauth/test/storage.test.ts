import { afterEach, setSystemTime } from "bun:test"
import { beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MemoryStorage } from "../src/storage/memory.js"

let storage = MemoryStorage()

beforeEach(async () => {
  storage = MemoryStorage()
  setSystemTime(new Date("1/1/2024"))
})

afterEach(() => {
  setSystemTime()
})

describe("set", () => {
  test("basic", async () => {
    await storage.set(["users", "123"], { name: "Test User" })
    const result = await storage.get(["users", "123"])
    expect(result).toEqual({ name: "Test User" })
  })

  test("ttl", async () => {
    await storage.set(
      ["temp", "key"],
      { value: "value" },
      new Date(Date.now() + 100),
    ) // 100ms TTL
    let result = await storage.get(["temp", "key"])
    expect(result?.value).toBe("value")

    setSystemTime(Date.now() + 150)
    result = await storage.get(["temp", "key"])
    expect(result).toBeUndefined()
  })

  test("persist keeps the latest concurrent update", async () => {
    const directory = await mkdtemp(join(tmpdir(), "openauth-storage-"))
    const persist = join(directory, "storage.json")

    try {
      const persistedStorage = MemoryStorage({ persist })
      const updates = 100
      // A large first snapshot makes the out-of-order write race deterministic.
      const initialPayload = "x".repeat(8 * 1024 * 1024)

      await Promise.all([
        persistedStorage.set(
          ["concurrent", "key"],
          { sequence: 0, payload: initialPayload },
          new Date(Date.now() + 1_000),
        ),
        ...Array.from({ length: updates }, (_, index) =>
          persistedStorage.set(
            ["concurrent", "key"],
            { sequence: index + 1 },
            new Date(Date.now() + 1_000 + index),
          ),
        ),
      ])

      const persisted = JSON.parse(await readFile(persist, "utf8"))
      expect(persisted[0][1].value).toEqual({ sequence: updates })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("nested", async () => {
    const complexObj = {
      id: 1,
      nested: { a: 1, b: { c: 2 } },
      array: [1, 2, 3],
    }
    await storage.set(["complex"], complexObj)
    const result = await storage.get(["complex"])
    expect(result).toEqual(complexObj)
  })
})

describe("get", () => {
  test("missing", async () => {
    const result = await storage.get(["nonexistent"])
    expect(result).toBeUndefined()
  })

  test("key", async () => {
    await storage.set(["a", "b", "c"], { value: "nested" })
    const result = await storage.get(["a", "b", "c"])
    expect(result?.value).toBe("nested")
  })
})

describe("remove", () => {
  test("existing", async () => {
    await storage.set(["test"], "value")
    await storage.remove(["test"])
    const result = await storage.get(["test"])
    expect(result).toBeUndefined()
  })

  test("missing", async () => {
    expect(storage.remove(["nonexistent"])).resolves.toBeUndefined()
  })
})

describe("scan", () => {
  test("all", async () => {
    await storage.set(["users", "1"], { id: 1 })
    await storage.set(["users", "2"], { id: 2 })
    await storage.set(["other"], { id: 3 })
    const results = await Array.fromAsync(storage.scan(["users"]))
    expect(results).toHaveLength(2)
    expect(results).toContainEqual([["users", "1"], { id: 1 }])
    expect(results).toContainEqual([["users", "2"], { id: 2 }])
  })

  test("ttl", async () => {
    await storage.set(["temp", "1"], "a", new Date(Date.now() + 100))
    await storage.set(["temp", "2"], "b", new Date(Date.now() + 100))
    await storage.set(["temp", "3"], "c")
    expect(await Array.fromAsync(storage.scan(["temp"]))).toHaveLength(3)
    setSystemTime(Date.now() + 150)
    expect(await Array.fromAsync(storage.scan(["temp"]))).toHaveLength(1)
  })
})
