"""
Codelord agent adapter for Harbor Terminal-Bench 2.0.

Usage:
    harbor run -d terminal-bench@2.0 \
        --agent-import-path ./codelord_agent.py:CodelordAgent \
        -m anthropic/claude-sonnet-4-6 \
        --ae CODELORD_API_KEY=$CODELORD_API_KEY
"""

from __future__ import annotations

import json
import os
import shlex
from pathlib import Path
from typing import Any

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


# Container path where the bundle is uploaded
_BUNDLE_CONTAINER_PATH = "/opt/codelord"
_OUTPUT_FILENAME = "codelord-output.txt"


class CodelordAgent(BaseInstalledAgent):
    """Harbor agent that runs codelord in headless (-p) mode."""

    @staticmethod
    def name() -> str:
        return "codelord"

    def get_version_command(self) -> str | None:
        return f"node {_BUNDLE_CONTAINER_PATH}/dist/bin.js --version"

    def parse_version(self, stdout: str) -> str:
        import re
        text = stdout.strip()
        match = re.search(r"(\d+\.\d+\.\d+)", text)
        return match.group(1) if match else text

    async def install(self, environment: BaseEnvironment) -> None:
        # Install Node.js 22 (as root)
        await self.exec_as_root(
            environment,
            command=(
                "if command -v apk &> /dev/null; then"
                "  apk add --no-cache curl bash nodejs npm;"
                " elif command -v apt-get &> /dev/null; then"
                "  apt-get update && apt-get install -y curl;"
                " fi"
            ),
            env={"DEBIAN_FRONTEND": "noninteractive"},
        )

        # Install nvm + Node 22 (as agent user)
        await self.exec_as_agent(
            environment,
            command=(
                "set -euo pipefail; "
                "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash && "
                'export NVM_DIR="$HOME/.nvm" && '
                '\\. "$NVM_DIR/nvm.sh" || true && '
                "nvm install 22 && node --version"
            ),
        )

        # Upload and extract the codelord bundle
        bundle_path = Path(__file__).parent / "codelord-bundle.tar.gz"
        if not bundle_path.exists():
            raise RuntimeError(
                f"Bundle not found at {bundle_path}. Run scripts/build-bundle.sh first."
            )

        await self.exec_as_root(
            environment,
            command=f"mkdir -p {_BUNDLE_CONTAINER_PATH}",
        )

        await environment.upload_file(
            source_path=bundle_path,
            target_path="/tmp/codelord-bundle.tar.gz",
        )

        await self.exec_as_root(
            environment,
            command=(
                f"tar xzf /tmp/codelord-bundle.tar.gz -C {_BUNDLE_CONTAINER_PATH} "
                "--strip-components=1 && "
                "rm /tmp/codelord-bundle.tar.gz && "
                f"chown -R $(id -u):$(id -g) {_BUNDLE_CONTAINER_PATH}"
            ),
        )

        # Verify installation
        await self.exec_as_agent(
            environment,
            command=(
                'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"; '
                f"node {_BUNDLE_CONTAINER_PATH}/dist/bin.js --version"
            ),
        )

    def _resolve_env(self) -> dict[str, str]:
        """Build environment variables for the codelord process."""
        env: dict[str, str] = {}

        # Resolve provider and model from Harbor's provider/model format
        provider = self._parsed_model_provider or "anthropic"
        model = self._parsed_model_name or ""

        env["CODELORD_PROVIDER"] = provider
        if model:
            env["CODELORD_MODEL"] = model

        # Reasoning level
        reasoning = os.environ.get("CODELORD_REASONING_LEVEL", "low")
        env["CODELORD_REASONING_LEVEL"] = reasoning

        # API key
        api_key = os.environ.get("CODELORD_API_KEY", "")
        if api_key:
            env["CODELORD_API_KEY"] = api_key

        # Max steps override
        max_steps = os.environ.get("CODELORD_MAX_STEPS", "")
        if max_steps:
            env["CODELORD_MAX_STEPS"] = max_steps

        # Base URL (custom API endpoint / proxy)
        base_url = os.environ.get("CODELORD_BASE_URL", "")
        if base_url:
            env["CODELORD_BASE_URL"] = base_url

        return {k: v for k, v in env.items() if v}

    def _parse_stream_json(self, raw: str) -> tuple[str, dict[str, Any] | None]:
        """Parse stream-json output. Returns (final_text, result_event)."""
        final_text = ""
        result_event: dict[str, Any] | None = None
        total_tokens = 0
        cost = 0.0

        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue

            etype = event.get("type")
            if etype == "text_delta":
                final_text += event.get("text", "")
            elif etype == "done":
                total_tokens = event.get("totalTokens", 0)
                cost = event.get("cost", 0.0)
            elif etype == "result":
                result_event = event
                if not final_text:
                    final_text = event.get("text", "")

        return final_text, result_event

    def populate_context_post_run(self, context: AgentContext) -> None:
        """Parse codelord output and populate token/cost info."""
        output_path = self.logs_dir / _OUTPUT_FILENAME
        if not output_path.exists():
            return

        raw = output_path.read_text()
        _, result_event = self._parse_stream_json(raw)

        if result_event:
            duration_ms = result_event.get("durationMs", 0)
            context.metadata = context.metadata or {}
            context.metadata["durationMs"] = duration_ms
            context.metadata["traceRunId"] = result_event.get("traceRunId")

    @with_prompt_template
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        escaped_instruction = shlex.quote(instruction)
        env = self._resolve_env()

        await self.exec_as_agent(
            environment,
            command=(
                'export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"; '
                f"node {_BUNDLE_CONTAINER_PATH}/dist/bin.js "
                f"-p {escaped_instruction} "
                f"--output-format stream-json "
                f"2>&1 </dev/null | tee /logs/agent/{_OUTPUT_FILENAME}"
            ),
            env=env,
        )
