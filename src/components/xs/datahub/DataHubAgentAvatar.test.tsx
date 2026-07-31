import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataHubAgentAvatar } from "./DataHubAgentAvatar";

function avatarSignature(element: HTMLElement) {
  return [
    element.dataset.avatarPersona,
    element.dataset.avatarTone,
    element.dataset.avatarVariant,
    element.dataset.avatarWeight
  ].join(":");
}

describe("DataHubAgentAvatar", () => {
  it("gives same-role child agents visibly distinct stable personas", () => {
    const identities = [
      "session-a",
      "session-b",
      "session-c",
      "session-d",
      "session-e",
      "session-f"
    ];

    render(
      <>
        {identities.map((identity) => (
          <DataHubAgentAvatar
            key={identity}
            name="数据研究员"
            identity={identity}
          />
        ))}
      </>
    );

    const avatars = screen.getAllByRole("img", {
      name: "数据研究员头像，数据分析"
    });
    expect(new Set(avatars.map(avatarSignature)).size).toBe(identities.length);
  });

  it("keeps one child agent's persona consistent across avatar sizes", () => {
    render(
      <>
        <DataHubAgentAvatar
          name="制度研究员"
          identity="policy-session"
          size="small"
        />
        <DataHubAgentAvatar
          name="制度研究员"
          identity="policy-session"
          size="large"
        />
      </>
    );

    const avatars = screen.getAllByRole("img", {
      name: "制度研究员头像，制度知识"
    });
    expect(avatars).toHaveLength(2);
    expect(avatarSignature(avatars[0])).toBe(avatarSignature(avatars[1]));
  });
});
