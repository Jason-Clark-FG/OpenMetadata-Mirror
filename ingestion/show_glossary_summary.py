"""Print a summary of the created Business Metrics glossary and its relation graphs."""

import json
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:8585/api"
TOKEN = (
    "eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJhbGciOiJS"
    "UzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJvcGVuLW1ldGFkYXRhLm9yZyIsInN1YiI6"
    "ImFkbWluIiwicm9sZXMiOlsiQWRtaW4iXSwiZW1haWwiOiJhZG1pbkBvcGVuLW1ldGFkYX"
    "RhLm9yZyIsImlzQm90IjpmYWxzZSwidG9rZW5UeXBlIjoiUEVSU09OQUxfQUNDRVNTIiwi"
    "dXNlcm5hbWUiOiJhZG1pbiIsInByZWZlcnJlZF91c2VybmFtZSI6ImFkbWluIiwiaWF0Ij"
    "oxNzc0NDE2ODQ5LCJleHAiOjE3Nzk2MDA4NDl9.T4_KIfClcRhl-l7Q7_uJVmAccqO3vI1k"
    "BomuFb4ag2SA6V7mdKK1m8JsrzaEwuWPRaNSzgHFaNoaSWIOuUnnz1TtqoazYe-VX7LaKUkX"
    "k6OPNfhT6FvylyUbiliMeEGljAfy02qPf4QNRpkAO1eoyU58URn66uCVXvnrPWMWu1O7orW"
    "Swqx5_hOhmVSoSt38Xys2t-1HkHYAjLsCnqFGE25SmshSo21Qy9PrGwscCASenjdGyySh3k"
    "L5JLHZJCJnTNJQA2xly-Lpu8hn2myo593hktx203gbxOldy9CniQZNv86porijkotSvZST1x"
    "f_iEq1OFHxy7XSQ6OfcfjdVg"
)
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}


def get(path, params=None):
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def print_graph(term_fqn, label):
    term = get(f"/v1/glossaryTerms/name/{term_fqn}", {"fields": "relatedTerms"})
    graph = get(f"/v1/glossaryTerms/{term['id']}/relationsGraph", {"depth": 2})
    nodes = {n["id"]: n["name"] for n in graph.get("nodes", [])}
    print(f"\n  {label} relation graph (depth=2):")
    for edge in graph.get("edges", []):
        f = nodes.get(edge["from"], "?")
        t = nodes.get(edge["to"], "?")
        r = edge["relationType"]
        print(f"    {f} --[{r}]--> {t}")


print("=" * 60)
print("GLOSSARY SUMMARY")
print("=" * 60)

glossary = get("/v1/glossaries/name/BusinessMetrics", {"fields": "termCount"})
print(f"\nGlossary: {glossary['displayName']}")
print(f"Total terms: {glossary.get('termCount', '?')}")

print("\n--- Sample Relation Graphs ---")
print_graph("BusinessMetrics.FinancialMetrics.LTV_CAC_Ratio", "LTV:CAC Ratio")
print_graph("BusinessMetrics.CustomerMetrics.CLV", "CLV")
print_graph("BusinessMetrics.CustomerMetrics.ChurnRate", "Churn Rate")

print("\n--- Relation Type Usage Counts ---")
usage = get("/v1/glossaryTerms/relationTypes/usage")
for rtype, count in sorted(usage.items(), key=lambda x: -x[1]):
    if count > 0:
        print(f"  {rtype}: {count}")
