# JEV as a Software Decision Primitive

Independent benchmark of JEV for dependency-update automation under distribution shift.

An independent Scarif Labs evaluation of a machine-native probabilistic decision primitive
in a real software workflow.

## Abstract

**We evaluated whether a general-purpose probabilistic decision primitive can extract and retain useful decision signal from software-change metadata under distribution shift.**

Using dependency updates as the concrete test case, JEV (TypeSafe's System One decision model) was compared against a deterministic static policy
and a strong general LLM (**DeepSeek Flash**) on identical pre-merge state. On a 1,102-case
in-distribution benchmark (551 breaking / 551 control), JEV showed substantially stronger
ranking quality (AUROC **0.851**) than static rules (**0.602**) and DeepSeek Flash
(**0.585**). On an independently constructed 185-case out-of-distribution (OOD) set
(100 breaking / 85 control, 103 independent repositories), JEV retained the highest AUROC
among the three (**0.605**, 95% CI 0.525–0.685) but the absolute performance fell sharply.
The important negative finding is operational: JEV's **frozen in-distribution threshold did
not transfer safely**. The threshold 0.62 produced 30 auto-merges at **50.0% precision**
with **15 unsafe merges**. The benchmark found a strong in-distribution JEV ranking signal
that weakened substantially under independent distribution shift. These results do not
establish general superiority or inferiority of JEV as a general decision primitive.


## What we tested

We tested a general software-systems idea: can a **typed probabilistic decision primitive**
provide decisions and uncertainty that ordinary code can consume directly inside a real
automation workflow? Dependency-update automation is the test case, not the product.

The benchmark separates three questions that are easy to conflate:

1. **Decision / ranking quality**: Does the score rank safe updates above unsafe ones?
2. **Probability calibration**: Do the numeric probabilities mean the same thing on new data?
3. **Safe operational automation**: Does a fixed threshold achieve a target precision on
   new data without unsafe actions?

A system can do well on (1) while failing (2) and (3). That distinction is central to the
findings.

## Context: JEV / System One

TypeSafe describes JEV and its **System One** models as structured, machine-oriented
decision systems intended to return typed decisions and uncertainty that software can
consume directly, rather than generated text. This repository is an **independent test of
that general idea**; it is not a reproduction of TypeSafe's own evaluations, a product
review, or an endorsement. Statements about TypeSafe's positioning are attributed to
TypeSafe and are not treated as established facts.

- Technology evaluated: https://typesafe.ai/

## About Scarif Labs

Scarif Labs is an independent product and software studio building websites, web apps, AI products, mobile apps, SaaS, and custom software for ambitious founders and teams. 

Through our research wing, we also get our hands dirty evaluating emerging technologies to understand their real-world capabilities. This artifact is an outcome of that research—an independent evaluation, not a commercial product.

- Scarif Labs: https://www.scariflabs.com/
- GitHub organization: https://github.com/scarif-labs
- Authors: Alen Lawrance, Harikrishnan PS, Vishnu Prakash

## Experimental design

**Task.** Given one dependency-update PR and only information available *before merge*,
choose `AUTO_MERGE`, `HOLD`, or a human-review action (`REQUIRE_REVIEW` / `HUMAN_REVIEW`).

**State (identical for every model).** Repository, ecosystem, package manager, dependency,
old/new version, update type, security flag, PR title/body, manifest diff, dependency
release notes, and pre-merge CI status. Post-merge facts (merge status, revert, failure
category, gold label) are never included. See `docs/benchmark.md` and
`data/leakage-report.json`.

**Repository-code scope.** The benchmark intentionally evaluates decisions from dependency-update metadata and pre-merge change context; the systems are **not given the repository's source code or an index of API usage**. This means the benchmark measures whether each system can extract transferable decision signal from the available change metadata, not whether it can perform repository-specific compatibility analysis. All three systems receive the same information, so this limitation applies equally to the comparative evaluation.

**Systems compared.**

- **JEV** (`jev-latest`): One `Choice` question whose criteria are the three actions; the
  answer provides a probability distribution and confidence.
- **DeepSeek Flash** (`~deepseek/deepseek-flash-latest`, returned as
  `deepseek/deepseek-v4.1-flash`): Structured JSON `{decision, risk, confidence}`,
  reasoning disabled, temperature 0.
- **Static rules**: A deterministic Renovate-style policy over update type and CI status.

**Evaluation.** Ranking quality uses AUROC and average precision over the control class.
Operational evaluation uses a threshold selected on a development split and applied
unchanged to a held-out split. Retrospective/oracle numbers (threshold chosen on the
evaluation labels) are always labelled as upper bounds and are kept separate from
deployable frozen-policy numbers. See `METHODOLOGY.md`.

## Results

All tables report the three systems with ranking metrics and operational metrics kept
separate. Figures are in `analysis/figures/`; full tables are in `RESULTS.md`.

![AUROC comparison](analysis/figures/auroc-comparison.svg)

### In-distribution (1,102 cases)

| system | AUROC | AP | oracle cov@99% | oracle cov@99.5% | precision@99% | unsafe@99% | mean latency | total cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Static rules | 0.602 | 0.486 | 10.34% | 0.00% | 99.12% | 1 | <1 ms | $0 |
| DeepSeek Flash | 0.585 | 0.459 | 0.91% | 0.91% | 100% | 0 | 2,178 ms | $0.7056 |
| JEV | 0.851 | 0.843 | 5.90% | 5.90% | 100% | 0 | 639 ms | $0.1447 |

### Independent OOD validation (185 cases)

| system | AUROC | AP |
| --- | --- | --- |
| Static rules | 0.569 | 0.368 |
| DeepSeek Flash | 0.534 | 0.385 |
| JEV | 0.605 | 0.510 |

JEV AUROC 95% bootstrap CI: 0.525–0.685. Frozen policies transferred from the original
benchmark (no OOD labels used to choose thresholds):

| system | frozen threshold | auto-merged | precision | coverage | unsafe merges |
| --- | --- | --- | --- | --- | --- |
| Static rules | 1.00 | 69 | 55.07% | 37.30% | 31 |
| DeepSeek Flash | 0.90 | 10 | 70.0% | 5.41% | 3 |
| JEV | 0.62 | 30 | 50.0% | 16.22% | 15 |

Retrospective oracle coverage at 99% and 99.5% precision measured 0% for all three systems
on OOD: no threshold on these scores produced a non-empty safe policy even with label access.

![Risk-coverage trade-off](analysis/figures/risk-coverage.svg)
![Frozen-policy transfer](analysis/figures/frozen-policy-transfer.svg)

### Additional analysis

**Ecosystem dependence:** JEV's OOD signal was highly dependent on the language ecosystem. While it retained a strong signal in JavaScript (AUROC 0.673), its performance in Rust, Java, and Go degraded to near or below chance.

![Ecosystem AUROC](analysis/figures/ecosystem-auroc.svg)

**Decision agreement:** A pairwise decision agreement analysis shows significant genuine disagreement between the three systems. Even when they perform similarly overall, they often make different individual mistakes.

![Decision agreement](analysis/figures/decision-agreement.svg)

**Score calibration:** High scores from JEV became dangerously overconfident under distribution shift, predicting safety when the actual safe rate was low.

![Score calibration](analysis/figures/score-calibration.svg)

**Operational profile:** JEV provided a middle ground in terms of latency and cost compared to the near-zero cost of static rules and the higher cost of the LLM.

![Latency vs Cost](analysis/figures/latency-cost.svg)

## What we learned

- In-distribution, JEV showed a strong ranking signal (AUROC 0.851), well above static
  rules (0.602) and DeepSeek Flash (0.585).
- On the independent OOD set, JEV retained the highest AUROC among the three (0.605) but
  only weakly above chance; the absolute performance fell sharply.
- The probability calibration/threshold did not transfer: the frozen 0.62 policy produced
  50.0% precision and 15 unsafe merges on OOD.
- **OOD performance was heterogeneous by ecosystem:** JEV AUROC was 0.673 on JavaScript cases versus 0.379 on non-JavaScript cases. Because the OOD population is predominantly npm and the non-JavaScript strata are comparatively small, this is treated as an observed distribution-shift signal requiring further investigation, not evidence of ecosystem-specific overfitting.
- Excluding ambiguous reverts did not change the conclusion (AUROC 0.605 → 0.592).
- Ranking quality, calibration, and safe automation are separate properties; the results
  differ across all three.

The benchmark found a strong in-distribution JEV ranking signal that weakened substantially
under independent distribution shift. JEV retained the highest OOD AUROC among the evaluated
systems, but its original probability threshold did not transfer safely.

The OOD result therefore concerns **transferability of metadata-level decision signal**, not the ability to determine whether a specific breaking API change is actually exercised by a repository.

## What this does not establish

These results do not establish general superiority or inferiority of JEV as a general
decision primitive. They do not establish:

- that any system can reliably determine repository-specific compatibility without source-code or API-usage context;
- that the observed OOD degradation would persist, disappear, or improve when repository source code is provided;
- that JEV is superior to LLMs or to static rules in general;
- that any system here is safe for production dependency automation;
- that JEV produces portable probability calibration across distributions;
- that JEV has no value as a general decision primitive.

## Reproducibility

All reported numbers are generated from canonical JSON artifacts by committed scripts.

```bash
node scripts/generate_public_report.mjs   # RESULTS.md, docs/, results* summaries, manifest
python scripts/make_figures.py              # analysis/figures/*.svg
node scripts/verify_public_numbers.mjs    # cross-checks markdown against canonical JSON
```

Raw per-case JSONL contain GitHub PR text and are not redistributed; hashes and
reconstruction scripts are provided. See `REPRODUCIBILITY.md`.

## Limitations

See `LIMITATIONS.md`. In brief: the OOD outcome mechanism differs (in-repository revert
rather than reproduced build failure); the OOD population is largely npm; 15/100 OOD
breaking reverts are ambiguous and only 6 state an explicit causal reason; 9 pre-merge
states are synthesized; 26/100 carry a version-parsing artifact; the original benchmark
shows temporal calibration instability; and the OOD sample is small (185 cases).

## Repository layout

```
README.md              this document
METHODOLOGY.md         data construction, leakage control, evaluation definitions
RESULTS.md             full generated results (in-distribution + OOD)
LIMITATIONS.md         limitations and unresolved questions
REPRODUCIBILITY.md     commands, hashes, and reconstruction
PUBLICATION_CHECKLIST.md
LICENSE                MIT (code and docs)
docs/                  benchmark.md, ood-validation.md, forensic-audit.md
analysis/              canonical JSON/MD analyses + figures/
data/                  schema, manifests, leakage reports (raw case files withheld)
results/               in-distribution public summary
results-ood/           OOD public summary
scripts/               build/evaluate/report/figure scripts
src/                   the frozen decision harness
```

## Data and licensing

- **BUMP** (`chains-project/bump`, MIT) is the source of the in-distribution breaking set.
- **Zenodo 12720767** (CC-BY-4.0) was inspected only and is not included.
- OOD cases and controls derive from public GitHub PRs; raw PR text is not redistributed.
  `data/MANIFEST.json` records hashes and `scripts/` can rebuild the datasets.
