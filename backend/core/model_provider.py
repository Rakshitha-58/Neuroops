"""NeuroOps Model Provider Layer.

Abstracts AI model calls so agents never hardcode a single provider.
Supports OpenAI, Google Gemini, and Anthropic Claude through a common
interface. Falls back to a deterministic stub when no API keys are set.
"""
from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from utils import logger


class ModelResponse:
    """Normalized response from any provider."""

    def __init__(self, content: str, confidence: float, provider: str, model: str, raw: Optional[dict] = None):
        self.content = content
        self.confidence = confidence
        self.provider = provider
        self.model = model
        self.raw = raw or {}

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "confidence": self.confidence,
            "provider": self.provider,
            "model": self.model,
        }


class BaseModelProvider(ABC):
    """Common interface every provider implements."""

    name: str = "base"

    @abstractmethod
    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Stub provider (no API key needed — deterministic heuristic output)
# ---------------------------------------------------------------------------

class StubProvider(BaseModelProvider):
    name = "stub"

    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        text = user_prompt.strip()
        words = len(text.split())
        # Produce a structured heuristic response based on keywords.
        output_lines = [f"[Stub Model] Processed request ({words} words):"]
        if re.search(r"\b(code|function|api|endpoint|class)\b", text, re.I):
            output_lines.append("- Detected: code generation task")
            output_lines.append("- Suggested approach: modular functions with error handling")
        if re.search(r"\b(debug|fix|bug|error|crash)\b", text, re.I):
            output_lines.append("- Detected: debugging task")
            output_lines.append("- Suggested approach: isolate failing path, add logging, narrow exception scope")
        if re.search(r"\b(website|site|web page|landing page|webpage)\b", text, re.I):
            site_title = "NeuroOps Generated Site"
            if re.search(r"\b(portfolio)\b", text, re.I):
                site_title = "Portfolio Showcase"
            elif re.search(r"\b(e-commerce|shop|store)\b", text, re.I):
                site_title = "E-Shop Experience"
            elif re.search(r"\b(blog)\b", text, re.I):
                site_title = "Insights Blog"

            html = [
                f"<!-- Generated website output for: {text.strip()} -->",
                "<!DOCTYPE html>",
                "<html lang=\"en\">",
                "<head>",
                f"  <meta charset=\"UTF-8\">",
                f"  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">",
                f"  <title>{site_title}</title>",
                "  <style>",
                "    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #0c1220; color: #e2e8f0; }",
                "    :root { --accent: #4f46e5; --bg: #070b1a; --surface: #111827; --muted: #94a3b8; }",
                "    .page { max-width: 1120px; margin: 0 auto; padding: 48px 24px; }",
                "    header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 24px; border-bottom: 1px solid rgba(148,163,184,0.12); }",
                "    h1 { font-size: 3rem; margin: 0; line-height: 1.05; }",
                "    p.lead { max-width: 680px; color: #cbd5e1; font-size: 1.05rem; }",
                "    .hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; }",
                "    .button { display: inline-flex; align-items: center; justify-content: center; padding: 14px 22px; border-radius: 999px; text-decoration: none; font-weight: 700; }",
                "    .button.primary { background: var(--accent); color: #ffffff; }",
                "    .card { background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(148,163,184,0.08); border-radius: 24px; padding: 28px; margin-top: 28px; }",
                "    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 32px; }",
                "    .card h2 { margin: 0 0 12px; font-size: 1.1rem; }",
                "  </style>",
                "</head>",
                "<body>",
                "  <div class=\"page\">",
                "    <header>",
                f"      <div><strong>{site_title}</strong><p class=\"lead\">A polished, responsive website created by NeuroOps per your request.</p></div>",
                "      <nav><a href=\"#\" class=\"button primary\">Get Started</a></nav>",
                "    </header>",
                "    <section class=\"card\">",
                f"      <h2>What this website includes</h2>",
                "      <ul>",
                "        <li>Responsive hero section with clear value proposition</li>",
                "        <li>Features / services grid for key offerings</li>",
                "        <li>Contact CTA and footer with social links</li>",
                "      </ul>",
                "    </section>",
                "    <section class=\"grid\">",
                "      <div class=\"card\"><h2>Home</h2><p>Landing page with strong headline, supporting details, and primary call to action.</p></div>",
                "      <div class=\"card\"><h2>About</h2><p>Company mission, brand story, and trust points to connect with visitors.</p></div>",
                "      <div class=\"card\"><h2>Contact</h2><p>Clear ways to get in touch with forms, email, and social profiles.</p></div>",
                "    </section>",
                "  </div>",
                "</body>",
                "</html>",
            ]
            return ModelResponse(
                content="\n".join(html),
                confidence=0.92,
                provider=self.name,
                model="stub-website-v1",
            )
        if re.search(r"\b(design|ui|ux|layout|wireframe)\b", text, re.I):
            output_lines.append("- Detected: design task")
            output_lines.append("- Suggested approach: 8px grid, WCAG AA contrast, progressive disclosure")
        if re.search(r"\b(test|qa|security|vulnerab)\b", text, re.I):
            output_lines.append("- Detected: testing task")
            output_lines.append("- Suggested approach: unit + integration tests, boundary cases")
        if re.search(r"\b(document|readme|guide|manual)\b", text, re.I):
            output_lines.append("- Detected: documentation task")
            output_lines.append("- Suggested approach: overview, usage, parameters, examples")
        if not any("- Detected" in line for line in output_lines[1:]):
            output_lines.append("- Detected: general task")
            output_lines.append("- Suggested approach: decompose into subtasks, research, implement, review")
        confidence = min(0.95, 0.6 + words / 200.0)
        return ModelResponse(
            content="\n".join(output_lines),
            confidence=confidence,
            provider=self.name,
            model="stub-v1",
        )


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------

class OpenAIProvider(BaseModelProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.api_key = api_key
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        import httpx

        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": kwargs.get("temperature", 0.3),
            },
            timeout=kwargs.get("timeout", 30),
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        return ModelResponse(content=content, confidence=0.85, provider=self.name, model=self.model, raw=data)


# ---------------------------------------------------------------------------
# Google Gemini provider
# ---------------------------------------------------------------------------

class GeminiProvider(BaseModelProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash"):
        self.api_key = api_key
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        import httpx

        resp = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}",
            json={
                "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
                "generationConfig": {"temperature": kwargs.get("temperature", 0.3)},
            },
            timeout=kwargs.get("timeout", 30),
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["candidates"][0]["content"]["parts"][0]["text"]
        return ModelResponse(content=content, confidence=0.83, provider=self.name, model=self.model, raw=data)


# ---------------------------------------------------------------------------
# Anthropic Claude provider
# ---------------------------------------------------------------------------

class ClaudeProvider(BaseModelProvider):
    name = "claude"

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        self.api_key = api_key
        self.model = model

    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        import httpx

        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": kwargs.get("max_tokens", 1024),
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_prompt}],
            },
            timeout=kwargs.get("timeout", 30),
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["content"][0]["text"]
        return ModelResponse(content=content, confidence=0.88, provider=self.name, model=self.model, raw=data)


# ---------------------------------------------------------------------------
# Model Manager — single entry point for agents
# ---------------------------------------------------------------------------

class ModelManager:
    """Routes model calls to the configured provider.

    Provider is selected via MODEL_PROVIDER env var or via runtime configuration.
      stub (default) | openai | gemini | claude
    """

    def __init__(self):
        self._provider: BaseModelProvider = None
        self._init_provider()

    def _init_provider(self):
        provider_name = os.environ.get("MODEL_PROVIDER", "stub")
        self.configure(provider_name, os.environ.get("OPENAI_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY") or "", os.environ.get("MODEL_NAME", ""))

    def configure(self, provider_name: str, api_key: str = "", model_name: str = "") -> BaseModelProvider:
        normalized_provider = (provider_name or "stub").lower()
        if normalized_provider == "openai" and api_key:
            self._provider = OpenAIProvider(api_key, model_name or "gpt-4o-mini")
        elif normalized_provider == "gemini" and api_key:
            self._provider = GeminiProvider(api_key, model_name or "gemini-1.5-flash")
        elif normalized_provider == "claude" and api_key:
            self._provider = ClaudeProvider(api_key, model_name or "claude-3-5-sonnet-20241022")
        else:
            logger.info("ModelManager: using stub provider (no API key configured for '%s')", normalized_provider)
            self._provider = StubProvider()
        return self._provider

    @property
    def provider_name(self) -> str:
        return self._provider.name

    def generate(self, system_prompt: str, user_prompt: str, **kwargs) -> ModelResponse:
        return self._provider.generate(system_prompt, user_prompt, **kwargs)


# Singleton model manager
model_manager = ModelManager()
