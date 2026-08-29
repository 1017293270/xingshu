import type { OfficialDocumentRole, OfficialDocumentStructureNode } from "@/types/officialDocument";

/**
 * 模板大纲：把后端返回的扁平 structureNodes 折成有层级的树。
 *
 * 层级信息其实一直都在（suggestParagraphRoles 已经推断出 TITLE / HEADING_1..3），
 * 只是过去被平铺成一条几百行的列表。这里只做归并，不改任何角色判定。
 */

/** 文档预览里每一段的 DOM id，大纲点击靠它定位。 */
export const templateNodeDomId = (nodeId: string) => `tpl-node-${nodeId}`;

export type TemplateOutlineKind = "fixed" | "heading" | "body" | "table" | "preserve";

export type TemplateOutlineItem = {
  /** 分组用的稳定 key；对应单个节点时就是 node.id。 */
  key: string;
  kind: TemplateOutlineKind;
  /** 缩进层级：固定区与一级标题为 0，二级 1，三级 2。 */
  depth: number;
  label: string;
  /** 树上显示的文本；正文归并项显示 “N 段正文”。 */
  preview: string;
  /** 该项覆盖的节点，点击时用第一个做滚动锚点。 */
  nodes: OfficialDocumentStructureNode[];
  children: TemplateOutlineItem[];
};

export type TemplateOutline = {
  items: TemplateOutlineItem[];
  /** 参与排版的节点（去掉空段落），文档预览按这个顺序渲染。 */
  documentNodes: OfficialDocumentStructureNode[];
  hasTitle: boolean;
  hasBody: boolean;
  /** 缺角色时给出的可读原因，用于「先校准结构」的提示。 */
  missingRoles: string[];
};

const HEADING_DEPTH: Partial<Record<OfficialDocumentRole, number>> = {
  HEADING_1: 0,
  HEADING_2: 1,
  HEADING_3: 2
};

/** 正文之外的单段角色，各自独占一行，置于树顶或树尾。 */
const FIXED_ROLES: OfficialDocumentRole[] = [
  "ISSUING_AUTHORITY",
  "TABLE_TEXT",
  "HEADER_FOOTER",
  "TITLE",
  "RECIPIENT",
  "ATTACHMENT_NOTE",
  "SIGNATURE",
  "DATE",
  "IMPRINT"
];

function isPreserved(node: OfficialDocumentStructureNode) {
  return node.role === "PRESERVE" || node.role === "UNKNOWN" || Boolean(node.empty);
}

/** 把连续的正文段落并成一条，避免几十行“正文 正文 正文”。 */
function flushBody(buffer: OfficialDocumentStructureNode[], depth: number): TemplateOutlineItem | null {
  if (buffer.length === 0) return null;
  const nodes = [...buffer];
  buffer.length = 0;
  return {
    key: `body-${nodes[0].id}`,
    kind: "body",
    depth,
    label: "正文",
    preview: nodes.length === 1
      ? nodes[0].preview
      : `${nodes.length} 段正文 · ${nodes[0].preview.slice(0, 18)}…`,
    nodes,
    children: []
  };
}

export function buildTemplateOutline(nodes: OfficialDocumentStructureNode[]): TemplateOutline {
  const items: TemplateOutlineItem[] = [];
  const preserved: OfficialDocumentStructureNode[] = [];
  const documentNodes: OfficialDocumentStructureNode[] = [];
  /** headingStack[d] 是当前深度 d 的标题项，正文和更深的标题都挂到它下面。 */
  const headingStack: Array<TemplateOutlineItem | undefined> = [];
  const bodyBuffer: OfficialDocumentStructureNode[] = [];

  const currentParent = () => {
    for (let depth = headingStack.length - 1; depth >= 0; depth -= 1) {
      const heading = headingStack[depth];
      if (heading) return heading;
    }
    return undefined;
  };

  const pushBody = () => {
    const parent = currentParent();
    const item = flushBody(bodyBuffer, parent ? parent.depth + 1 : 0);
    if (!item) return;
    (parent ? parent.children : items).push(item);
  };

  for (const node of nodes) {
    if (node.tableIndex !== undefined && node.tableRowIndex === undefined) {
      pushBody();
      const parent = currentParent();
      const item: TemplateOutlineItem = {
        key: node.id,
        kind: "table",
        depth: parent ? parent.depth + 1 : 0,
        label: node.slotType === "FIXED_TABLE_TEXT" ? node.roleLabel : node.dataBinding ? "问数表格" : "表格",
        preview: node.preview || `表格 ${(node.tableIndex ?? 0) + 1}`,
        nodes: [node],
        children: []
      };
      (parent ? parent.children : items).push(item);
      documentNodes.push(node);
      continue;
    }

    if (isPreserved(node)) {
      preserved.push(node);
      if (!node.empty && node.preview) documentNodes.push(node);
      continue;
    }

    documentNodes.push(node);

    const headingDepth = HEADING_DEPTH[node.role];
    if (headingDepth !== undefined) {
      pushBody();
      const item: TemplateOutlineItem = {
        key: node.id,
        kind: "heading",
        depth: headingDepth,
        label: node.roleLabel,
        preview: node.preview || "（空标题）",
        nodes: [node],
        children: []
      };
      // 一级标题回到根，二三级挂到上一级；上一级缺失时就近退到已有层级。
      let parent: TemplateOutlineItem | undefined;
      for (let depth = headingDepth - 1; depth >= 0; depth -= 1) {
        if (headingStack[depth]) {
          parent = headingStack[depth];
          break;
        }
      }
      (parent ? parent.children : items).push(item);
      headingStack[headingDepth] = item;
      // 进入新标题后，更深的层级失效。
      for (let depth = headingDepth + 1; depth < headingStack.length; depth += 1) {
        headingStack[depth] = undefined;
      }
      continue;
    }

    if (FIXED_ROLES.includes(node.role)) {
      pushBody();
      items.push({
        key: node.id,
        kind: "fixed",
        depth: 0,
        label: node.roleLabel,
        preview: node.preview || "（空）",
        nodes: [node],
        children: []
      });
      // 固定区不承接正文，后续正文回到最近的标题或根。
      continue;
    }

    bodyBuffer.push(node);
  }

  pushBody();

  if (preserved.length) {
    items.push({
      key: `preserve-${preserved[0].id}`,
      kind: "preserve",
      depth: 0,
      label: "原样保留",
      preview: `${preserved.length} 段随原稿保留`,
      nodes: preserved,
      children: []
    });
  }

  const hasTitle = nodes.some((node) => node.role === "TITLE");
  const hasBody = nodes.some((node) => node.role === "BODY" && node.paragraphIndex !== undefined);
  const missingRoles = [
    hasTitle ? "" : "标题",
    hasBody ? "" : "正文"
  ].filter(Boolean);

  return { items, documentNodes, hasTitle, hasBody, missingRoles };
}

/** 树展开成一维，供键盘遍历与「展开全部」使用。 */
export function flattenTemplateOutline(items: TemplateOutlineItem[]): TemplateOutlineItem[] {
  return items.flatMap((item) => [item, ...flattenTemplateOutline(item.children)]);
}
