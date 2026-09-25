# saas/scripts/cos-university-xsa-runtime.py
"""Shared Exclusive Self Attention runtime for the governed COS University experiment.

This module contains the exact projection used by every Transformers-side XSA path.
It is deliberately inert until the University architecture canary selects XSA.
Serving through the current native-vLLM path remains separately gated.
"""

from __future__ import annotations

from typing import Any

XSA_RUNTIME_PROFILE = "qwen3_xsa_projection_v1"
XSA_ATTENTION_ARCHITECTURE = "exclusive_self_attention_v1"
XSA_EPSILON = 1e-6
SUPPORTED_ATTENTION_CLASS = "Qwen3Attention"


def exclusive_self_attention_projection(
    attention_output,
    value_output,
    *,
    num_attention_heads: int,
    num_key_value_heads: int,
    head_dim: int,
    eps: float = XSA_EPSILON,
):
    """Remove each attention head's component along its current-token value direction.

    attention_output is the standard attention aggregation immediately before o_proj,
    flattened as [batch, tokens, num_attention_heads * head_dim].

    value_output is the *actual* v_proj output for the same current tokens, flattened as
    [batch, tokens, num_key_value_heads * head_dim]. Capturing the real v_proj output is
    important for QLoRA because recomputing v_proj could use a different LoRA-dropout mask.

    For grouped-query attention, each KV head is repeated over the query-head group exactly
    as standard Qwen attention does before the per-head orthogonal projection.
    """
    import torch.nn.functional as F

    if getattr(attention_output, "ndim", None) != 3 or getattr(value_output, "ndim", None) != 3:
        raise RuntimeError("xsa_tensor_rank_invalid")
    if attention_output.shape[:2] != value_output.shape[:2]:
        raise RuntimeError("xsa_token_shape_mismatch")
    if num_attention_heads <= 0 or num_key_value_heads <= 0 or head_dim <= 0:
        raise RuntimeError("xsa_head_geometry_invalid")
    if num_attention_heads % num_key_value_heads != 0:
        raise RuntimeError("xsa_gqa_geometry_invalid")
    if attention_output.shape[-1] != num_attention_heads * head_dim:
        raise RuntimeError("xsa_attention_width_mismatch")
    if value_output.shape[-1] != num_key_value_heads * head_dim:
        raise RuntimeError("xsa_value_width_mismatch")

    batch, tokens, _ = attention_output.shape
    y = attention_output.reshape(batch, tokens, num_attention_heads, head_dim)
    value = value_output.reshape(batch, tokens, num_key_value_heads, head_dim)
    if num_attention_heads != num_key_value_heads:
        value = value.repeat_interleave(num_attention_heads // num_key_value_heads, dim=2)

    value_unit = F.normalize(value, p=2.0, dim=-1, eps=eps)
    projected = y - (y * value_unit).sum(dim=-1, keepdim=True) * value_unit
    return projected.reshape_as(attention_output)


def _head_geometry(attention_module: Any) -> tuple[int, int, int]:
    config = getattr(attention_module, "config", None)
    num_attention_heads = int(getattr(config, "num_attention_heads", 0) or 0)
    num_key_value_heads = int(getattr(config, "num_key_value_heads", 0) or 0)
    head_dim = int(getattr(attention_module, "head_dim", 0) or 0)
    if (
        num_attention_heads <= 0
        or num_key_value_heads <= 0
        or head_dim <= 0
        or num_attention_heads % num_key_value_heads != 0
    ):
        raise RuntimeError("xsa_qwen3_head_geometry_invalid")
    return num_attention_heads, num_key_value_heads, head_dim


def install_qwen3_xsa(model: Any) -> dict[str, Any]:
    """Install XSA between standard attention aggregation and o_proj on Qwen3.

    Hooks are attached to the existing v_proj and o_proj modules. This preserves the model's
    selected attention backend, KV-cache behavior, QLoRA adapters and the *actual* value tensor
    produced inside that forward pass. No Q/K/V weights or attention scores are changed.
    """
    installed = 0
    already_installed = 0

    for attention_module in model.modules():
        if type(attention_module).__name__ != SUPPORTED_ATTENTION_CLASS:
            continue
        if getattr(attention_module, "_itmounts_xsa_installed", False):
            already_installed += 1
            continue

        value_proj = getattr(attention_module, "v_proj", None)
        output_proj = getattr(attention_module, "o_proj", None)
        if value_proj is None or output_proj is None:
            raise RuntimeError("xsa_qwen3_projection_modules_missing")

        num_attention_heads, num_key_value_heads, head_dim = _head_geometry(attention_module)
        state: dict[str, Any] = {"value_output": None}

        def capture_value(_module, _args, output, *, _state=state):
            _state["value_output"] = output

        def project_output(_module, args, *, _state=state, _nah=num_attention_heads, _nkv=num_key_value_heads, _hd=head_dim):
            if not args:
                raise RuntimeError("xsa_o_proj_input_missing")
            value_output = _state.get("value_output")
            if value_output is None:
                raise RuntimeError("xsa_value_capture_missing")
            _state["value_output"] = None
            projected = exclusive_self_attention_projection(
                args[0],
                value_output,
                num_attention_heads=_nah,
                num_key_value_heads=_nkv,
                head_dim=_hd,
            )
            return (projected, *args[1:])

        value_handle = value_proj.register_forward_hook(capture_value)
        output_handle = output_proj.register_forward_pre_hook(project_output)
        attention_module._itmounts_xsa_hook_handles = (value_handle, output_handle)
        attention_module._itmounts_xsa_installed = True
        installed += 1

    if installed == 0 and already_installed == 0:
        raise RuntimeError("xsa_qwen3_attention_modules_missing")

    return {
        "profile": XSA_RUNTIME_PROFILE,
        "attentionArchitecture": XSA_ATTENTION_ARCHITECTURE,
        "installedAttentionLayers": installed,
        "alreadyInstalledAttentionLayers": already_installed,
        "projectionPoint": "attention_aggregation_before_o_proj",
        "usesActualValueProjection": True,
        "gqaAware": True,
    }


def remove_qwen3_xsa(model: Any) -> int:
    """Remove previously installed XSA hooks. Used only by controlled tests/rollback."""
    removed = 0
    for attention_module in model.modules():
        handles = getattr(attention_module, "_itmounts_xsa_hook_handles", None)
        if not handles:
            continue
        for handle in handles:
            handle.remove()
        attention_module._itmounts_xsa_hook_handles = None
        attention_module._itmounts_xsa_installed = False
        removed += 1
    return removed
