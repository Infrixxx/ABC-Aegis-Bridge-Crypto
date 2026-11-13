"""
app/agents/graph_builder.py
─────────────────────────────
Compiles the LangGraph StateGraph for the ABC agent pipeline.

Graph topology:
                    ┌──────────────┐
         START ───► │   security   │
                    └──────┬───────┘
                   pass    │   reject
                           │◄────────────── END (REJECTED)
                    ┌──────▼───────┐
                    │   guardian   │
                    └──────┬───────┘
                   pass    │   block
                           │◄────────────── END (BUDGET_EXCEEDED)
                    ┌──────▼───────┐
                    │  transaction │
                    └──────┬───────┘
                           │
                          END (PAID | FAILED)

Calling convention:
    from app.agents.graph_builder import build_graph
    graph = build_graph()
    final_state = graph.invoke(initial_state)
"""

from langgraph.graph import StateGraph, END

from app.agents.state import ABCState
from app.agents.security_agent import security_node, route_after_security
from app.agents.guardian_agent import guardian_node, route_after_guardian
from app.agents.transaction_agent import transaction_node


def build_graph() -> StateGraph:
    """
    Builds and compiles the ABC LangGraph agent pipeline.

    Returns a compiled graph ready for .invoke() calls.
    The graph is stateless between invocations — safe for concurrent use.
    """
    workflow = StateGraph(ABCState)

    # ── Register nodes ────────────────────────────────────────────────────────
    workflow.add_node("security",    security_node)
    workflow.add_node("guardian",    guardian_node)
    workflow.add_node("transaction", transaction_node)

    # ── Entry point ───────────────────────────────────────────────────────────
    workflow.set_entry_point("security")

    # ── Conditional edges ─────────────────────────────────────────────────────
    workflow.add_conditional_edges(
        "security",
        route_after_security,
        {
            "proceed": "guardian",
            "reject":  END,
        },
    )

    workflow.add_conditional_edges(
        "guardian",
        route_after_guardian,
        {
            "proceed": "transaction",
            "block":   END,
        },
    )

    # ── Terminal edge ─────────────────────────────────────────────────────────
    workflow.add_edge("transaction", END)

    return workflow.compile()


# Module-level compiled graph — built once, reused across all requests
abc_graph = build_graph()
