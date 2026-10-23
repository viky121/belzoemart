# Resiliency Decisions — E-Commerce Portal (Belzo eMart)

You enabled the **Resiliency Baseline** extension. That extension defines several decisions that must be
made by you (not by me), because they involve real cost/complexity tradeoffs. Since you chose a
**tight-budget MVP** (Q12) hosted on **AWS** (Q11), I've marked a recommended MVP-appropriate option for
each. Just confirm or change each `[Answer]:`.

## Question R1: RTO/RPO Goals and Disaster Recovery Strategy
What are your Recovery Time Objective (RTO) and Recovery Point Objective (RPO) goals? These determine the
appropriate Disaster Recovery strategy and infrastructure redundancy level.

A) RPO/RTO: Hours — Backup & Restore strategy. Lowest cost. Data backed up, redeploy from IaC and restore
on failure. Suitable for MVP / non-critical workloads.

B) RPO/RTO: 10s of minutes — Pilot Light. Cost: $$. Infra deployed but idle, scaled up on failover.

C) RPO/RTO: Minutes — Warm Standby. Cost: $$$. Services run at reduced capacity.

D) RPO/RTO: Near real-time — Multi-site Active/Active. Highest cost.

E) N/A — Single-region multi-zone is acceptable, no cross-region DR needed.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question R2: Regional Topology
Does this workload require multi-region deployment, or is single-region with multi-zone redundancy
sufficient?

A) Single-region, multi-zone — tolerates zone failure, not full-region failure. Lower cost.
(Recommended for MVP; aligns with R1 option A/E.)

B) Multi-region active-passive — survives region failure with failover. Higher cost.

C) Multi-region active-active — survives region failure with no downtime. Highest cost.

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question R3: Change Management Process
How should production changes for this workload be governed?

A) Use our existing organizational change management process (name it in Other, e.g. Jira Change).

B) No formal process exists yet — propose a lightweight change management process (change record +
approval + rollback note) for the team to adopt. (Recommended for a new MVP.)

C) N/A — this workload is exempt from formal change management. Document the exemption rationale.

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question R4: CI/CD and Deployment Tooling
What CI/CD tooling should this workload use?

A) Use our existing CI/CD pipeline (name the tool in Other, e.g. GitHub Actions, GitLab CI, Jenkins).

B) No pipeline exists — propose a CI/CD pipeline definition appropriate to the stack (Next.js + Node +
PostgreSQL on AWS). (Recommended; I'll propose GitHub Actions unless you say otherwise.)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question R5: Rollback Mechanism
How should a failed production deployment be rolled back?

A) Redeploy previous IaC/artifact version (version-pinned rollback). (Recommended for MVP simplicity.)

B) Blue/green swap back to the previous environment.

C) Canary auto-rollback on health/metric regression.

D) Database-aware rollback required (schema/data migration reversal) — flag for explicit design.

E) Use our organization's existing rollback procedure (reference it in Other).

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question R6: Deployment Style
What deployment strategy is acceptable for this workload's risk profile?

A) Direct / in-place (lowest cost, highest blast radius) — acceptable for non-critical MVP.

B) Rolling (gradual instance replacement). (Reasonable low-cost default with less risk than direct.)

C) Blue/green (zero-downtime cutover, higher cost).

D) Canary (progressive traffic shift with automated rollback).

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question R7: Incident Response Process
How are production incidents handled for this workload?

A) Use our existing incident response process (reference it in Other, e.g. PagerDuty/on-call).

B) No formal process exists — propose a lightweight incident response + Correction of Errors (COE)
process for adoption. (Recommended for a new MVP.)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question R8: Resiliency Testing Approach
How will resiliency mechanisms (failover, recovery) be validated?

A) Use our existing DR testing / game day / chaos engineering practice (reference in Other).

B) No practice exists — propose a DR testing schedule and chaos experiment plan for adoption.

C) Defer to the Operations phase — capture test scenarios now, execute during Operations. (Recommended,
since Operations is a placeholder phase and this is an MVP.)

X) Other (please describe after [Answer]: tag below)

[Answer]: C
