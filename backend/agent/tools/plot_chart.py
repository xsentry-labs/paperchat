from __future__ import annotations
import base64
import io
from .base import Tool


class PlotChartTool(Tool):
    @property
    def name(self) -> str:
        return "plot_chart"

    @property
    def description(self) -> str:
        return (
            "Generate a chart or visualization and return it as a base64-encoded PNG image. "
            "Use matplotlib to create bar charts, line graphs, scatter plots, histograms, etc. "
            "Write your matplotlib code and call plt.savefig() — the image will be captured automatically."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": (
                        "matplotlib Python code to generate the chart. "
                        "Do NOT call plt.show(). The figure will be captured automatically after your code runs. "
                        "Example: plt.bar(['A','B','C'], [1,2,3]); plt.title('Example')"
                    ),
                },
                "width": {
                    "type": "integer",
                    "description": "Chart width in inches (default 8)",
                    "default": 8,
                },
                "height": {
                    "type": "integer",
                    "description": "Chart height in inches (default 5)",
                    "default": 5,
                },
            },
            "required": ["code"],
        }

    async def execute(self, code: str, width: int = 8, height: int = 5) -> str:
        import sys
        import traceback
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            return "[plot_chart] matplotlib is not installed in this environment."
        try:
            import numpy as np
        except ImportError:
            np = None
        try:
            import pandas as pd
        except ImportError:
            pd = None

        plt.figure(figsize=(width, height))

        namespace = {
            "__builtins__": __builtins__,
            "plt": plt,
            "np": np,
            "pd": pd,
        }

        try:
            exec(compile(code, "<plot_code>", "exec"), namespace)
        except Exception:
            err = traceback.format_exc()
            plt.close("all")
            return f"[Plot error]\n{err}"

        buf = io.BytesIO()
        try:
            plt.tight_layout()
            plt.savefig(buf, format="png", dpi=150, bbox_inches="tight")
            buf.seek(0)
            img_b64 = base64.b64encode(buf.read()).decode()
        finally:
            plt.close("all")

        return f"data:image/png;base64,{img_b64}"
