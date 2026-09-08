export const SCHEMA_URL = "https://raw.githubusercontent.com/hades200082/env-sync/master/schema.json";

/** Starter config written by `envsync --init`. Mirrors examples/envsync.json. */
export function starterConfig(): string {
  const config = {
    $schema: SCHEMA_URL,
    tools: [
      {
        name: "gh",
        description: "GitHub CLI",
        check: "gh",
        install: {
          apt: [
            "type -p wget >/dev/null || (sudo apt-get update && sudo apt-get install wget -y)",
            "sudo mkdir -p -m 755 /etc/apt/keyrings",
            "out=$(mktemp) && wget -nv -O$out https://cli.github.com/packages/githubcli-archive-keyring.gpg",
            "cat $out | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null",
            "sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg",
            "sudo mkdir -p -m 755 /etc/apt/sources.list.d",
            'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
            "sudo apt-get update",
            "sudo apt-get install gh -y",
          ],
          dnf: "sudo dnf install -y 'dnf-command(config-manager)' && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo dnf install -y gh --repo gh-cli",
          brew: "brew install gh",
          winget: "winget install --id GitHub.cli --exact --accept-source-agreements --accept-package-agreements",
        },
        update: {
          apt: "sudo apt-get update && sudo apt-get install -y --only-upgrade gh",
          dnf: "sudo dnf upgrade -y gh",
          brew: "brew upgrade gh || true",
          winget: "winget upgrade --id GitHub.cli --exact --accept-source-agreements --accept-package-agreements",
        },
      },
      {
        name: "skills",
        description: "Agent skills installed with the skills CLI",
        install:
          "npx -y skills@latest add mattpocock/skills -a claude-code -g -y && npx -y skills@latest add DistinctionUK/distinction-claude-code-skills -a claude-code -g -y",
        update: "npx -y skills@latest update -g -y",
      },
    ],
  };
  return JSON.stringify(config, null, 2) + "\n";
}
