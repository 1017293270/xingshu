import {
  ChartLineUp,
  Code,
  Database,
  FileText,
  MagnifyingGlass,
  Robot,
  ShieldCheck
} from "@phosphor-icons/react";
import type { Icon, IconWeight } from "@phosphor-icons/react";

type AgentAvatarProfile =
  | "data"
  | "policy"
  | "audit"
  | "code"
  | "research"
  | "analysis"
  | "general";

type AgentAvatarSize = "small" | "medium" | "large";

type DataHubAgentAvatarProps = {
  name: string;
  identity?: string;
  size?: AgentAvatarSize;
  className?: string;
  /**
   * 显式指定标识色 tone（1-6），通常来自 assignSubagentTones 的派发序分配；
   * 不传时回退到 identity 哈希，保证同一身份颜色稳定。
   */
  tone?: number;
};

type AgentAvatarDefinition = {
  profile: AgentAvatarProfile;
  label: string;
  icon: Icon;
  matches: RegExp;
};

const avatarDefinitions: readonly AgentAvatarDefinition[] = [
  {
    profile: "policy",
    label: "制度知识",
    icon: FileText,
    matches: /制度|政策|合规|合同|法务|知识|文档|policy|legal|knowledge|document/i
  },
  {
    profile: "audit",
    label: "风险校验",
    icon: ShieldCheck,
    matches: /审计|风控|校验|审核|验证|质检|audit|risk|verify|review/i
  },
  {
    profile: "code",
    label: "工程执行",
    icon: Code,
    matches: /代码|开发|工程|编程|code|coding|developer|engineer/i
  },
  {
    profile: "data",
    label: "数据分析",
    icon: Database,
    matches: /sql|数据|指标|报表|数据库|查询|data|metric|table|query/i
  },
  {
    profile: "research",
    label: "信息检索",
    icon: MagnifyingGlass,
    matches: /研究|检索|搜索|调研|资料|research|search|retrieval/i
  },
  {
    profile: "analysis",
    label: "经营分析",
    icon: ChartLineUp,
    matches: /分析|洞察|经营|策略|规划|analysis|insight|planner/i
  }
];

const generalDefinition = {
  profile: "general",
  label: "通用协作",
  icon: Robot
} satisfies Omit<AgentAvatarDefinition, "matches">;

const robotWeights: readonly IconWeight[] = ["duotone", "regular", "bold"];

function resolveAvatar(name: string) {
  return (
    avatarDefinitions.find((definition) => definition.matches.test(name)) ??
    generalDefinition
  );
}

function stableHash(identity: string) {
  let hash = 0;
  for (const character of identity) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash;
}

export function agentAvatarTone(identity: string, name: string): number {
  return (stableHash(`${identity}:${name}`) % 6) + 1;
}

function resolveRobotProfile(name: string, identity: string) {
  const hash = stableHash(`${identity}:${name}`);
  return {
    tone: agentAvatarTone(identity, name),
    variant: (Math.floor(hash / 6) % 4) + 1,
    weight: robotWeights[Math.floor(hash / 24) % robotWeights.length]
  };
}

export function DataHubAgentAvatar({
  name,
  identity = name,
  size = "medium",
  className = "",
  tone
}: DataHubAgentAvatarProps) {
  const definition = resolveAvatar(name);
  const RoleIcon = definition.icon;
  const robotProfile = resolveRobotProfile(name, identity);
  const resolvedTone = tone ?? robotProfile.tone;

  return (
    <span
      role="img"
      aria-label={`${name}头像，${definition.label}`}
      data-avatar-persona="robot"
      data-avatar-tone={resolvedTone}
      data-avatar-variant={robotProfile.variant}
      data-avatar-weight={robotProfile.weight}
      title={`${name} · ${definition.label}`}
      className={[
        "xs-datahub-agent-avatar",
        `xs-datahub-agent-avatar--${definition.profile}`,
        `xs-datahub-agent-avatar--${size}`,
        `xs-datahub-agent-avatar--tone-${resolvedTone}`,
        `xs-datahub-agent-avatar--variant-${robotProfile.variant}`,
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Robot
        className="xs-datahub-agent-avatar__persona"
        weight={robotProfile.weight}
        aria-hidden="true"
      />
      <span className="xs-datahub-agent-avatar__role" aria-hidden="true">
        <RoleIcon weight="bold" />
      </span>
    </span>
  );
}
