import test from "node:test";
import assert from "node:assert/strict";

const memory = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(defaults) { return { ...defaults, ...memory }; },
      async set(patch) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        Object.assign(memory, structuredClone(patch));
      }
    }
  }
};

const { filterItems, getState, patchItem, upsertItems } = await import("../src/storage.js");

test("note remains saved when a source refresh overlaps the write", async () => {
  const original = {
    id: "same-item",
    titleEn: "Original title",
    publishedAt: "2026-08-31T10:00:00.000Z",
    note: "",
    saved: false,
    read: false,
    readLater: false
  };
  await upsertItems([original]);

  await Promise.all([
    patchItem("same-item", { note: "课程选题测试" }),
    upsertItems([{ ...original, titleEn: "Refreshed title" }])
  ]);

  const state = await getState();
  assert.equal(state.items[0].note, "课程选题测试");
  assert.equal(state.items[0].titleEn, "Refreshed title");
});

test("patching a missing item reports a save failure", async () => {
  await assert.rejects(() => patchItem("missing", { note: "test" }), /保存失败/);
});

test("filtering items is serialized with concurrent item writes", async () => {
  await upsertItems([{ id: "invalid-course", publishedAt: "2026-08-31T09:00:00.000Z" }]);
  await Promise.all([
    filterItems((item) => item.id !== "invalid-course"),
    patchItem("same-item", { note: "仍然保留" })
  ]);
  const state = await getState();
  assert.equal(state.items.some((item) => item.id === "invalid-course"), false);
  assert.equal(state.items.find((item) => item.id === "same-item").note, "仍然保留");
});
