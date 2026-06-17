"""Guard against the log_audit(...) wrong-variable bug class.

Several endpoints called log_audit(..., <entity_id>) with a name that didn't
exist in the function (e.g. `rate_id` instead of `tax_rate_id`, `p.id` instead
of `product.id`). Because the audit call runs AFTER the DB write, this 500s the
request only at runtime — create/edit/delete look fine until exercised.

This statically asserts every log_audit() call's final positional argument
resolves to a name defined in its enclosing function (a param or an assignment).
"""
import ast
import glob
import os

import pytest

API_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "api", "v1")


def _offending_calls():
    bad = []
    for path in sorted(glob.glob(os.path.join(API_DIR, "*.py"))):
        tree = ast.parse(open(path).read())
        for fn in [n for n in ast.walk(tree) if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))]:
            defined = {a.arg for a in fn.args.args}
            for n in ast.walk(fn):
                if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
                    defined.add(n.id)
                if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n is not fn:
                    defined.update(a.arg for a in n.args.args)
            for call in ast.walk(fn):
                if (isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
                        and call.func.id == "log_audit" and call.args):
                    last = call.args[-1]
                    if isinstance(last, ast.Name) and last.id not in defined:
                        bad.append(f"{os.path.basename(path)}:{last.lineno} {fn.name}() -> '{last.id}'")
                    elif (isinstance(last, ast.Attribute) and isinstance(last.value, ast.Name)
                          and last.value.id not in defined):
                        bad.append(f"{os.path.basename(path)}:{last.lineno} {fn.name}() -> '{last.value.id}.{last.attr}'")
    return bad


def test_log_audit_entity_id_is_always_defined():
    bad = _offending_calls()
    assert not bad, "log_audit() called with an undefined entity-id variable:\n  " + "\n  ".join(bad)
