import { readFile } from "node:fs/promises";

// 更新日志服务：读取包根 CHANGELOG.md 并解析为结构化数据，供管理台「关于」页内嵌展示。
// 本项目 CHANGELOG 由人工维护、格式固定（## vX.Y.Z → ### 分类 → - 条目 → **对比**：链接），
// 用显式正则逐行解析即可，不引入 markdown 库。

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogVersion {
  version: string;
  compareUrl?: string;
  sections: ChangelogSection[];
}

/** CHANGELOG.md 位于包根（build/services/ 的上两级），与 config/server.ts 读 package.json 同款相对定位 */
const CHANGELOG_URL = new URL("../../CHANGELOG.md", import.meta.url);

const VERSION_RE = /^##\s+(v\S+)\s*$/;
const SECTION_RE = /^###\s+(.+?)\s*$/;
const ITEM_RE = /^-\s+(.+)$/;
const COMPARE_RE = /^\*\*对比[^*]*\*\*：\s*(\S+)/;

/**
 * 逐行解析 CHANGELOG markdown。
 * 容忍格式噪声：无法归入任何版本/小节的行（标题、空行、游离文本）直接跳过，
 * 只要有 ## vX 版本头 + - 条目就能产出结构化结果。
 */
export function parseChangelog(md: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let version: ChangelogVersion | null = null;
  let section: ChangelogSection | null = null;
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    let m = VERSION_RE.exec(line);
    if (m) {
      version = { version: m[1], sections: [] };
      section = null;
      versions.push(version);
      continue;
    }
    if (!version) continue; // 版本头之前的行（# Changelog 等）跳过
    m = SECTION_RE.exec(line);
    if (m) {
      section = { title: m[1], items: [] };
      version.sections.push(section);
      continue;
    }
    m = COMPARE_RE.exec(line);
    if (m) {
      version.compareUrl = m[1];
      continue;
    }
    m = ITEM_RE.exec(line);
    if (m && section) {
      section.items.push(m[1]);
    }
  }
  return versions;
}

/** 读取包根 CHANGELOG.md 并解析；文件不存在时抛原始 ENOENT（调用方按 code 判断降级） */
export async function getChangelog(): Promise<ChangelogVersion[]> {
  const md = await readFile(CHANGELOG_URL, "utf-8");
  return parseChangelog(md);
}
