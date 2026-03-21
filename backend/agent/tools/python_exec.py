from __future__ import annotations
import sys
import io
import traceback
from .base import Tool

MAX_OUTPUT_CHARS = 10000
TIMEOUT_SECONDS = 30

# Denied imports for safety
DENIED_IMPORTS = {
    "os", "subprocess", "shutil", "socket", "sys",
    "ctypes", "multiprocessing", "threading",
}


class PythonExecTool(Tool):
    @property
    def name(self) -> str:
        return "python_exec"

    @property
    def description(self) -> str:
        return (
            "Execute Python code for data analysis. "
            "pandas, numpy, and matplotlib are available. "
            "Use this for calculations, data transformations, statistical analysis, or processing structured data. "
            "Print your results — the output of print() statements is returned. "
            "Do NOT use this for file system operations or network calls."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Python code to execute. Use print() to output results.",
                },
            },
            "required": ["code"],
        }

    async def execute(self, code: str) -> str:
        # Basic safety check — deny certain imports
        for denied in DENIED_IMPORTS:
            if f"import {denied}" in code or f"from {denied}" in code:
                return f"[Safety error: import '{denied}' is not allowed]"

        # Run in a restricted namespace
        namespace = {
            "__builtins__": __builtins__,
            "pd": None,
            "np": None,
            "plt": None,
        }

        try:
            import pandas as pd
            import numpy as np
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt

            namespace["pd"] = pd
            namespace["np"] = np
            namespace["plt"] = plt
        except ImportError as e:
            pass

        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()

        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout = stdout_capture
        sys.stderr = stderr_capture

        try:
            exec(compile(code, "<agent_code>", "exec"), namespace)
            output = stdout_capture.getvalue()
            errors = stderr_capture.getvalue()
        except Exception:
            output = stdout_capture.getvalue()
            errors = traceback.format_exc()
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

        result_parts = []
        if output:
            result_parts.append(output)
        if errors:
            result_parts.append(f"Stderr:\n{errors}")

        result = "\n".join(result_parts) if result_parts else "(no output)"

        if len(result) > MAX_OUTPUT_CHARS:
            result = result[:MAX_OUTPUT_CHARS] + "\n... (truncated)"

        return result
