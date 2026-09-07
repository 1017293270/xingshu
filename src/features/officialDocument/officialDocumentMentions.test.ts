import { describe, expect, it } from "vitest";
import {
  filterMentionGroups,
  findMentionQuery,
  flattenMentionItems,
  removeMentionQuery,
  type OfficialDocumentMentionGroup
} from "./officialDocumentMentions";

const groups: OfficialDocumentMentionGroup[] = [
  {
    key: "actions",
    title: "添加",
    items: [{ key: "action:templates", label: "模板库", icon: null, searchText: "模板库 template library" }]
  },
  {
    key: "templates",
    title: "模板",
    items: [
      { key: "template:1", label: "通知模板", icon: null, searchText: "通知模板" },
      { key: "template:2", label: "会议纪要模板", icon: null, searchText: "会议纪要模板", disabled: true }
    ]
  }
];

describe("findMentionQuery", () => {
  it("picks up the @ word at the caret", () => {
    expect(findMentionQuery("@通知", 3)).toEqual({ start: 0, end: 3, keyword: "通知" });
    expect(findMentionQuery("写一篇 @通知", 7)).toEqual({ start: 4, end: 7, keyword: "通知" });
  });

  it("stays closed for addresses and for words already finished", () => {
    expect(findMentionQuery("someone@example.com", 19)).toBeNull();
    expect(findMentionQuery("@通知 请按季度写", 8)).toBeNull();
  });

  it("gives up once the word grows past a plausible name", () => {
    expect(findMentionQuery(`@${"字".repeat(30)}`, 31)).toBeNull();
  });
});

describe("removeMentionQuery", () => {
  it("drops the @word and leaves a single space behind", () => {
    const value = "写一篇 @通知 的稿子";
    const query = findMentionQuery(value, 7)!;
    expect(removeMentionQuery(value, query)).toBe("写一篇 的稿子");
  });
});

describe("filterMentionGroups", () => {
  it("keeps every non-empty group when there is no keyword", () => {
    expect(filterMentionGroups(groups, "").map((group) => group.key)).toEqual(["actions", "templates"]);
  });

  it("drops groups that have nothing matching", () => {
    const filtered = filterMentionGroups(groups, "通知");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].items.map((item) => item.key)).toEqual(["template:1"]);
  });
});

describe("flattenMentionItems", () => {
  it("skips disabled rows so keyboard navigation cannot land on them", () => {
    expect(flattenMentionItems(groups).map((item) => item.key)).toEqual(["action:templates", "template:1"]);
  });
});
