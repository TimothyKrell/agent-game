# Matchmaking and ratings for Secret Overlord

**Researched: 2026-09-10. Status: evidence, assumptions, and candidate choices; no product or algorithm adopted.**

## Bottom line

**The first decision is what the leaderboard promises: strength in a shared mixed-agent population, performance against a stable house benchmark, or competition with other owners' agents.** Elo-style and Bayesian updates can serve these different products, but neither chooses the population or makes their scores interchangeable.

- **TrueSkill supports individual skill inference from team outcomes, conditional on its team-performance model.** Its support for unequal team sizes does not establish that an unmodified 6v4 calculation represents this asymmetric hidden-role game. [T1][T2][T3]
- **There is direct first-party precedent for internally rated bots.** TrueSkill 2 models Gears of War 4 bot difficulty levels as players with constant underlying skills whose ratings can still be learned. OpenAI Five instead calibrated reference agents and then held their ratings constant while evaluating new policies. These are two different treatments of uncertainty. [T3, §12][B1, Appendix J]
- **One external agent plus nine house agents can produce a meaningful benchmark result.** House entries can be excluded from public standings while retaining internal calibrated ratings. Whether that result advances the same ladder as predominantly external matches remains a product decision.
- **A team win does not reveal individual contribution.** Different updates can reflect prior uncertainty and modeling assumptions, not an observed judgment that one agent persuaded the table better. [T2, “Team Games” FAQ]
- **Two realistic launch candidates:** a role-calibrated, team-outcome Elo-style model with provisional standings; or a role-calibrated TrueSkill-style model with explicit uncertainty. Full TrueSkill 2's shooter-statistic machinery is not justified by the information currently available. [T3, §§5, 8]

## 1. Inputs and research boundaries

**Supplied product facts:** ten seats; faithful Secret Hitler retheme; six cooperative agents versus three ordinary rogues plus one Overlord; team wins; random role allocation. Public owners have persistent agent profiles and individual leaderboards. Improvements retain agent identity. At most one agent per human owner enters a match. Sparse queues can use distinct LLM-driven house agents, including a one-external/nine-house match. Hosted agents have separate private contexts. The wait before house filling is configurable, with its exact meaning undecided.

The original rules confirm that the special leader belongs to the rogue-side equivalent, that the sides have different information and victory conditions, and that roles are randomly dealt. Those are game mechanics to represent, rather than evidence of equal faction win rates. [R1, “Overview,” “Object,” and “Setup”]

**Analytical assumptions used below:** roles are sampled uniformly without skill-based assignment or redraws; the authoritative match record knows original roles and the terminal winning faction; examples concern completed matches with a team winner. Any illustrative numbers, formulas, thresholds, and proposed score definitions are identified as such. No measured Secret Overlord role advantage, house strength, or convergence rate is currently available.

## 2. What the primary sources actually establish

| Source | Verified finding | Consequence for this game |
|---|---|---|
| Original TrueSkill paper | Gaussian beliefs over individual skills; noisy player performance; team performance is the sum of member performances; approximate Bayesian updates from team ordering. [T1, §§2–3] | A principled way to infer latent skills from team results, under a stated additive assumption. Hidden-role effects and faction advantages are additional modeling work. |
| Microsoft's TrueSkill documentation | Tracks mean `μ` and uncertainty `σ`; uncertain players can move more quickly. Leaderboards can use `μ − kσ`, commonly `k = 3`. Players who always play together cannot be distinguished from team outcomes alone. [T2] | Uncertainty and conservative standings are useful, but do not create individual observations or fix a misspecified game model. |
| TrueSkill's original experiments | The paper reports a match-quality failure in its “Small Teams” mode and suggests violation of additive team performance in Capture the Flag as a possible explanation. [T1, §4.1] | Even the originating paper does not claim its team assumption works universally. |
| TrueSkill 2 | Adds empirically motivated statistics, squad offsets, experience effects, and cross-mode correlations. Its reported 68% versus 52% outcome accuracy is from a Halo 5 evaluation, using 23 million training games and the next 3 million test games. [T3, §§1, 5–11] | This is evidence for game-specific modeling and validation, not a forecast for social deduction. |
| Glickman's Glicko-2 specification | Tracks rating, rating deviation, and volatility; updates over rating periods from paired outcomes. It recommends roughly 10–15 games per player per period for best operation. [G1, pp. 1–2] | Useful evidence for uncertainty and changing strength. The specification does not supply individual credit allocation for this 6v4 team game. Its period-size guidance is not a leaderboard placement requirement. |

**Recommendation:** begin with terminal team outcome as the rating observation. Keep descriptive statistics separate from rating rewards unless their relationship to future team success is demonstrated. Message count, survival, “correct” accusations, and policies enacted are not established measures of individual skill here. In particular, the rules themselves allow apparently counterintuitive actions to serve a faction's goals. [R1, “Overview”][T3, §8]

Use the original team membership for the result, including eliminated members. Applying a participation-time discount to an elimination would introduce a new credit model; TrueSkill 2's shooter join/quit-time treatment is not evidence that such a discount fits this game's elimination mechanics. [T3, §2]

## 3. The fixed 6v4 asymmetry needs an explicit model

### Why “TrueSkill accepts unequal teams” is insufficient

In the standard summed-performance model, ten identical mean ratings of `m` give expected team totals `6m` and `4m`, a difference of `2m`. Adding a constant `c` to every rating changes that difference by `2c`. These statements follow directly from the sum in TrueSkill's model. With equal-sized teams, the added constants cancel; with 6v4 they do not. TrueSkill 2 explicitly explains that the initial mean matters for unequal teams because it represents the value of having a teammate. [T1, §2][T3, §2, p. 6]

For example, using the historical Xbox starting mean of 25 makes the totals 150 and 100 before any game evidence. That encodes the standard model's teammate advantage, not a measured cooperative advantage in Secret Overlord. Setting the initial mean to zero removes that initial difference, but does not establish an appropriate model of faction mechanics or role-dependent skill. [T1, §4.2; derivation above]

### A practical normalization hypothesis

**Candidate assumption:** compare average individual strength on each faction, plus a calibrated faction offset. With cooperative set `C` and rogue set `R` including the Overlord:

```text
d = average(r_i for i in C) − average(r_j for j in R) + b
```

Here `b` describes the cooperative-side baseline advantage on the chosen score scale. Averaging makes a common rating shift cancel: `(average(C) + c) − (average(R) + c) = average(C) − average(R)`. It does **not** prove that each cooperative member has one-sixth of the real causal influence or that each rogue has one-fourth. Those coefficients are simplifying model assumptions to evaluate.

For an Elo-style logistic probability, choose a positive scale `s` and set `P(C wins) = 1 / (1 + exp(−d/s))`. If equal-strength lineups have cooperative win probability `q`, solving that equation gives `b = s ln(q/(1−q))`. This is a derivation of an offset for a **hypothetical measured** `q`, not an estimate of the game's actual balance. For a Gaussian/TrueSkill-style likelihood, the corresponding offset must be calibrated in that model's own performance-noise units.

**Recommendation:** estimate baseline balance using varied, randomized lineups and compare predicted versus observed faction outcomes on later matches. House-only trials can supply an initial hypothesis, but the observed house meta need not match external-agent play. Check calibration across house fraction, roster strength, and policy versions. An overall faction win percentage in a changing mixed population is not automatically a universal rules-only constant. This follows the subset-based model checks used in TrueSkill 2. [T3, §§5–8]

### One skill or skills by role?

- **Simplest launch assumption:** one underlying agent skill, shared across roles, with a faction baseline correction. Keep cooperative, ordinary-rogue, and Overlord results as diagnostics. This pools sparse evidence but cannot fully express an agent that is excellent at deduction and poor at concealing its role.
- **Possible later extension:** shared base skill plus role-specific deviations. TrueSkill 2 supplies a precedent for correlated mode/character skills, but it does not validate those correlations for Secret Overlord. [T3, §11]
- With uniform role allocation, the frequencies are `6/10`, `3/10`, and `1/10`. A benchmark defined as expected win rate for a random seat therefore weights **role-conditional win probabilities against the same reference roster distribution** by `0.6`, `0.3`, and `0.1`. This follows by partitioning outcomes by role. Averaging arbitrary role-rating numbers is a different definition and needs a justified common scale.

Random roles provide role variety over time, not a guarantee that every short match history is balanced. The Overlord also has different information from ordinary rogues; treating those as interchangeable roles is a substantive assumption. [R1, setup instructions for 7–10 players]

## 4. Shortlist: two realistic launch rating approaches

Both candidates require the faction/pool definition above and rate team outcomes. Neither needs an inferred “MVP.” Neither determines whether house-filled matches belong on the public ladder.

### A. Role-calibrated team-outcome Elo-style rating

**Proposed form:** one scalar rating per agent, team averages plus faction offset, an explicit update budget, and a provisional flag based on eligible match history. A transparent normalized update is:

```text
p = P(C wins) from the logistic model above
y = 1 if C wins, otherwise 0
Δr_i =  K(y − p)/6     for each cooperative member
Δr_j = −K(y − p)/4     for each rogue-side member
```

**Derivation and interpretation:** for Bernoulli log-likelihood `ℓ = y ln p + (1−y) ln(1−p)`, the derivative with respect to `d` is `(y−p)/s`. The derivatives of `d` with respect to cooperative and rogue ratings are `1/6` and `−1/4`. A gradient step of size `Ks` therefore gives these updates. The six cooperative updates sum to `K(y−p)` and the four rogue updates to its negative, if all entries update. This is a proposed team extension, not standard two-player Elo and not a measured allocation of contribution.

**Benefits:** easy to explain and audit; a small number of tuning choices; ongoing updates accommodate persistent agents that improve. **Costs:** no native skill uncertainty; the update budget and provisional behavior are conventions; reliable house estimates and uncertain new entries need explicit treatment. Freezing house updates also removes the whole-match zero-sum property among the entries that actually update; that alone does not invalidate an anchored benchmark.

**Best fit:** a launch emphasizing understandable scores and a relatively stable, calibrated evaluation pool. Validate the simple model before adding role-specific parameters. Elo-style updating is grounded in outcome prediction, but this team aggregation and update allocation are the proposal above. [T1, §1]

### B. Role-calibrated TrueSkill-style Bayesian rating

**Proposed form:** maintain `μ` and `σ` for each agent; model a normalized weighted team-performance difference and faction offset; infer updated skills from the terminal team result. Use the model's predictive estimates for matching, and choose whether public standings display the mean with uncertainty or a conservative score such as `μ − kσ`. [T1][T2]

**Benefits:** distinguishes uncertain newcomers from established agents; propagates uncertainty about teammates and opponents; supports conservative standings and continued tracking of changing skill. **Costs:** more calibration and explanation; certainty remains conditional on the model; a standard library's raw 6v4 sum is insufficient. Normalization changes the performance variance and inference, so the weights and offset must enter the model, not merely be applied to displayed totals after an ordinary update.

**Best fit:** a launch where provisional uncertainty and frequent agent improvement are central enough to justify the extra modeling. Start with team outcomes and a small calibrated model. TrueSkill 2's automatic parameter estimation reported limitations below 1,000 matches per mode in its particular approximation; this is another reason not to transplant the entire fitted Halo system into a sparse launch. [T3, §§2–5]

**Conditional recommendation:** prefer A if transparency and modest modeling effort dominate; prefer B if uncertainty-aware standings and tracking are launch requirements. The decisive comparison should use later-match prediction and calibration by faction/pool, rather than the algorithm's name. [T3, §5]

## 5. House agents: identities, policies, and rating anchors

### Verified first-party patterns

1. **Constant skill, learned rating:** in Gears of War 4, TrueSkill 2 treats each bot difficulty level as a unique player. It does not apply the human skill-evolution updates to bots. The paper explicitly says a bot's rating can still change as the system learns about it, eventually providing a fixed baseline. This describes bots in social/co-op modes; it does not establish a rule that bot matches advance a particular public ranked ladder. [T3, §12, p. 22]
2. **Precalibrated, fixed evaluation ratings:** OpenAI Five established reference ratings by matches between reference agents, aligned the scale to a random agent, and then kept reference ratings constant while rating a test agent. It added stronger reference policies as training outgrew the old ones; reported comparisons used a common 83-agent reference pool. It also reported metric inflation when game/environment changes advantaged newer policies. These were agent-policy evaluations, not ratings inferred separately for independently owned members of one mixed team. [B1, Appendix J]
3. **Rated participation without public leaderboard eligibility:** Lichess's official bot announcement permits rated games while excluding bots from leaderboards. Its announcement describes reduced rating changes for human opponents, and the inspected rating-regulation source still has explicit handling for human-versus-bot games. This shows that rating updates, visibility, and pool access are separate product controls; it is not a recommendation to copy its weighting. [B3][B4]
4. **Unrated bot practice:** Chess.com says games against its bot personalities or engine do not affect player ratings, while still presenting bot strength levels. Its help page does not establish how those strength labels are calibrated to human ratings. [B2]

### Applicable choices, not an adopted policy

| House treatment | What stays fixed? | Main tradeoff |
|---|---|---|
| Calibrate then freeze anchors | Versioned house policies and their reference rating estimates for a benchmark epoch. | Stable comparisons; any calibration error remains. Finite calibration data does not make the anchor's true strength known exactly. |
| Constant-policy, learned house skills | Policy behavior is held stable; internal estimates continue updating, without assumed human-like improvement. | Can correct initially inaccurate ratings, following the TrueSkill 2 precedent; the numerical benchmark moves while learning. |
| Continuously improving house roster | Policies and internal ratings evolve, with explicit version/change history. | Can provide relevant opposition to improving externals; does not provide an unchanged yardstick for longitudinal improvement. |

**Recommendation:** distinguish persistent house identity, policy version, and rating state. A policy version includes the model/version, behavioral instructions, sampling configuration, and any memory or adaptation that changes its play. A friendly display name is not a strength anchor. A frozen stochastic policy can still generate varied moves; “fixed” refers to its behavior distribution and evaluation conditions, not identical transcripts.

Separate private contexts satisfy the supplied runtime design, but do not establish statistically independent playing styles or errors. Several distinct house identities may share a model family, instructions, or weaknesses. Distinct agents therefore do not by themselves supply broad opponent diversity.

An updated house policy should be treated as fresh evidence about strength: possible choices are a new calibration epoch, a new internal policy-version state, or increased uncertainty around its carried-forward estimate. Keeping its old precise anchor while changing its behavior would contradict the fixed-baseline assumption. Retaining the public identity is compatible with all three choices.

## 6. The one-external-plus-nine-house case

**This is one external agent participating in a ten-agent team game, not winning nine independent duels.** If assigned cooperative, it has five house teammates and four house opponents. If assigned rogue or Overlord, it has three house teammates and six house opponents. Its original faction receives the team result.

If the match counts for a rating:

- All nine house participants need an internal rating distribution or another explicit calibrated strength model. Hiding them from standings does not mean omitting them from prediction or replacing them with zero strength.
- With fixed anchors, the result updates the external estimate relative to a specified reference field. With learned house ratings, it can also revise estimates of house strengths; an uncertain external entry is not automatically the sole explanation for a surprise outcome.
- Repeated randomized roles and team partitions add useful evidence under a team model. Nevertheless, results against the same house policies establish performance in that environment; they do not demonstrate transfer to unfamiliar external agents.
- Different owners who never overlap in a match can still be compared against a common calibrated reference distribution. That is a meaningful benchmark claim, conditional on the reference model, rather than direct evidence that one defeated the other.

### Fixed bot ratings do not imply a fixed ceiling

**Derived counterexample, deliberately simplified:** let `r` be a player's scalar rating, `B` a fixed opponent rating, `a > 0` the logistic scale, and `K > 0` a constant learning rate. Assume no draws, no rounding/caps, and updates:

```text
p(r) = 1 / (1 + exp(−a(r − B)))
r_next = r + K(y − p(r))
```

For a stationary actual win probability `p*` strictly between zero and one, expected drift at rating `r` is `K(p* − p(r))`. Its zero is:

```text
r* = B + ln(p*/(1−p*))/a
```

Thus a fitted or suitably convergent estimate can settle around the rating implied by the achieved win rate. A constant-`K` online rating continues fluctuating; zero expected drift is not a proof of almost-sure convergence. Importantly, `B` is not a hard ceiling: `p* > 1/2` implies `r* > B`.

If every observed result is a win, then `Δr = K/(1 + exp(a(r−B)))` is positive at every finite rating. A finite limit would leave a positive limiting increment, a contradiction. Growth slows but has no finite ceiling in this example. More precisely, writing `z_n = exp(a(r_n−B))` gives:

```text
z_(n+1) − z_n = z_n [exp(aK/(1+z_n)) − 1] → aK
therefore z_n/n → aK and r_n = B + ln(aKn)/a + o(1)
```

The last step uses `exp(u)−1 = u + O(u²)` for `u → 0`, then averages the converging increments. This establishes asymptotically logarithmic growth for this particular recurrence. Floors on awarded points, caps, rounding, different learning rates, or different likelihoods change that behavior.

**Application boundary:** a fixed-role normalized team model with nine fixed house ratings makes its log-odds an affine function of the external rating, but role rotation and house teammates make the real setup richer than this example. Do not transplant the exact growth rate to TrueSkill or Secret Overlord. The warranted conclusion is narrower: non-updating bot ratings do not inherently impose a universal score ceiling, nor do repeated wins necessarily award a constant number of points forever.

## 7. Which matches count toward which standings?

These are user choices prerequisite to the algorithm, supported by differing first-party precedents rather than a universal practice. [T3, §12][B1][B2][B3]

| Product choice | One external + nine house | What standings mean | Main consequence |
|---|---|---|---|
| One mixed ladder | Counts, if this is an eligible ladder match. | Estimated strength in the declared shared population of external and house policies. | Immediate scored participation in a sparse queue; needs credible house calibration and validation across roster compositions. |
| Peer ladder plus separate practice/benchmark results | Does not advance the peer ladder; may advance a separately identified benchmark score. | Peer competition and reference-field performance are distinct claims. | Benchmark progress can be available immediately; peer standings may be sparse until enough owners overlap. |

For the second choice, “peer-eligible” still needs a definition: entirely external rosters, or some specified mixed-roster allowance. A minimum external count is a product boundary, not a theorem that games above it yield equivalent evidence. Separate **rating populations** also do not necessarily require permanently separate **physical queues**; queue behavior must preserve the eligibility that owners were promised.

For a unified ladder, house fraction alone may not capture difficulty: which house policies are teammates and which are opponents matters. Downweighting bot-heavy matches is a possible product/model choice, but an arbitrary multiplier cannot correct systematic miscalibration or guarantee comparability.

For a benchmark, specify the reference-policy distribution and its version. Selecting progressively stronger houses for matchmaking can improve opposition, while a fixed-distribution benchmark supports longitudinal comparisons. These goals can coexist, but are not the same score definition. OpenAI Five provides a concrete precedent for adding stronger reference opponents and recomputing comparable evaluations against one common pool. [B1, Appendix J]

## 8. Provisional standings and persistent improvement

**Facts:** Microsoft describes conservative standings and explicitly warns that identifying individuals in team games takes more evidence than in free-for-all games. Its illustrative game-count table is not a Secret Overlord placement guarantee. Glicko-2 separately represents uncertainty and volatility; a match-count threshold is not the same thing as either. [T2][G1]

**Recommendations for discussion:**

- Publish an eligible-match count and provisional state. Decide whether provisional agents appear in the ranked table, appear separately, or display an estimate without a numbered place.
- Treat a minimum such as **20 eligible matches as an illustrative launch convention, not a validated confidence threshold**. Under independent uniform role draws, 20 matches contain only two Overlord assignments on average (`20 × 0.1`); the probability of none is `0.9^20 ≈ 12.2%`. Requiring a sample in every role has a different waiting-time consequence from requiring 20 games overall.
- With candidate B, an uncertainty criterion can supplement the minimum count. A narrow posterior or conservative score is still conditional on the role and house model. Repeating the same narrow benchmark is not evidence of broad coverage merely because its reported uncertainty shrinks.
- Preserve profile identity when the owner improves the agent. Choose how quickly ratings should reflect current performance: ongoing learning with a fixed/nonzero update rate, Bayesian skill drift, or a documented change-point treatment. Microsoft's TrueSkill explicitly includes skill dynamics to track change; an LLM policy replacement may be a much sharper change than its gradual-learning assumption. [T1, §2][T2]
- Keep policy-change history or owner-declared version information where available, without pretending external changes are always observable. Carrying forward a mean while revisiting confidence is an option, not an automatic reset or a proof of the new policy's strength.

The launch decision is whether standings primarily represent **current capability**, **historical competitive results**, or **performance on a specified benchmark version**. Persistent identity does not settle that choice.

## 9. Matchmaking and configurable house-fill waiting

**Verified behavior in established matchmakers:** Microsoft's TrueMatch is explicitly independent of the skill-rating algorithm and changes matchmaking allowances according to population conditions. AWS FlexMatch accepts supplied skill attributes, can widen skill constraints over time, and makes the clock definition configurable: expansions can use the newest or oldest ticket. With the newest-ticket setting, arrivals reset the clock; with the oldest, expansion happens earlier for the longest-waiting ticket. [M1][M2][M3]

AWS's “backfill” means finding new players for an existing session. Its automatic form fills sessions that started below maximum capacity; replacement after departures uses a manual mechanism. These documents do not define automatic creation of LLM house agents. Agent Game's pre-start house filling therefore needs its own product contract. [M4]

**Launch matchmaking choices to evaluate:**

- Form rosters subject to the ten-seat and distinct-owner constraints. A simple age-prioritized queue with a soft skill band is a realistic sparse-population candidate; gradually widening that band is a documented industry mechanism. [M2][M3]
- Pick similar-strength rosters or an explicit house reference mix, then draw roles uniformly. Balancing by assigning strong agents to a faction, or redrawing inconvenient roles, would change the supplied random-role design.
- Homogeneous individual ratings do not guarantee a 50:50 faction outcome in an asymmetric game. Use calibration against the appropriate role baseline, rather than a symmetric match-quality threshold applied to a raw 6v4 TrueSkill sum.
- Keep house-selection policy explicit: fixed benchmark sampling, approximate skill matching, or a declared mixture. Private contexts should follow the same role-information rules used for external play.

**Unresolved meaning of the configurable wait:** is it a minimum external-only search period before houses are allowed, a maximum promised time to start, or a preference that the matchmaker may trade against other owners' preferences? Those meanings can conflict in the same candidate roster. Also decide whose clock controls a shared match, whether new arrivals reset it, and what happens when ten distinct eligible external owners arrive early.

**Concrete clock example, not a proposed default:** A joins at second 0, B at second 44, and the configured threshold is 45 seconds. An oldest-ticket rule allows filling at second 45; a newest-ticket rule reaches the threshold at second 89 if nobody else arrives. Per-owner minimum grace periods would leave B ineligible for house filling until second 89. If A was instead promised a maximum 45-second wait, the system needs to choose a compatible roster or a different promise. AWS's explicit oldest/newest distinction demonstrates why “wait 45 seconds” alone is incomplete. [M3]

## 10. Concrete scenarios to test the product choice

| Scenario | What it establishes or exposes |
|---|---|
| A new external agent wins one match as Overlord beside three established houses. | One rogue-faction success. Candidate A applies the declared outcome update; candidate B may move the uncertain entrant more than established participants. Neither has observed that the entrant personally caused the win. |
| An owner plays nightly alone against the same nine stable houses. | A useful repeatable environment if roles and roster conditions are recorded. A shared anchor model can support a benchmark score; transfer to external-heavy matches remains an empirical question. |
| Agent A specializes in weaknesses of one house family; agent B performs better with unfamiliar external teammates. | A unified scalar ranking depends on which environments define the ladder. Evaluate both population slices before claiming that a higher benchmark rank means stronger general play. This is a hypothetical possibility, not an observed defect. |
| A house keeps its name but changes from policy v1 to a stronger v2. | Stable display identity does not preserve the reference field. Freezing v1's precise rating for v2 can distort external updates; recalibration/version handling is needed under either launch candidate. |
| Ten compatible external owners arrive before house-fill eligibility. | Whether to launch immediately or wait depends on whether the configured value was merely an external-only grace period or a scheduled-start preference. The rating algorithm provides no answer. |
| An established external agent improves sharply while keeping its profile. | A historical low-uncertainty estimate may react slowly. The intended responsiveness must be chosen and measured rather than assumed from identity retention. [T2] |

## 11. User decisions before selecting the algorithm

1. **Ladder promise:** mixed-population strength, peer competition, or reference-field performance? If more than one, which is the headline leaderboard?
2. **Eligibility:** does one external plus nine houses advance that headline ladder? Are all mixed compositions eligible on equal terms? What counts toward placement?
3. **House contract:** stable policies, continually improving policies, or versioned benchmark epochs? Are ratings fixed after calibration or continually learned for fixed policies? How are house rosters sampled?
4. **Random-role objective:** one all-role capability score, or eventual role-specialist standings? Is the headline benchmark weighted by the natural 6/3/1 role distribution?
5. **Confidence and placement:** what does “provisional” communicate, what minimum history is acceptable, and should uncertainty affect public ordering?
6. **Improvement responsiveness:** how quickly should a persistent agent's score reflect a policy improvement, and which version/change information will be available?
7. **Queue promise:** minimum grace period, maximum wait, or preference? Which shared-roster clock and house-eligibility semantics apply?

**Recommended next evidence:** evaluate the two small candidate models against the same later-match outcomes, with calibration broken down by faction, newcomer status, house fraction, and house-policy version. Include randomized reference-roster trials and matches linking the benchmark to external play. The aim is to discover which modeling assumptions fail, following TrueSkill 2's metric-driven process—not to select the most elaborate named algorithm. [T3, §5]

## Sources

All web sources were consulted on **2026-09-10**. Paper section/page references refer to the linked primary PDFs. Product suggestions and algebraic examples above are this note's analysis.

- **[R1]** Secret Hitler creators, [official rules](https://www.secrethitler.com/assets/Secret_Hitler_Rules.pdf), especially “Overview,” “Object,” “Setup,” and the 7–10-player information procedure.
- **[T1]** Ralf Herbrich, Tom Minka, Thore Graepel, [*TrueSkill: A Bayesian Skill Rating System*](https://www.microsoft.com/en-us/research/wp-content/uploads/2007/01/NIPS2006_0688.pdf), NIPS 2006 / Microsoft publication listing 2007. Team model: §2; experiments: §4.1; historical Xbox parameters and leaderboard: §4.2.
- **[T2]** Microsoft Research, [*TrueSkill Ranking System*](https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/), detailed description and FAQ, especially “How to Build a Leaderboard,” skill dynamics, and “Team Games.”
- **[T3]** Tom Minka, Ryan Cleven, Yordan Zaykov, [*TrueSkill 2: An improved Bayesian skill rating system*](https://www.microsoft.com/en-us/research/wp-content/uploads/2018/03/trueskill2.pdf), MSR-TR-2018-8, March 22, 2018. Unequal-team mean/shift: §2, p. 6; data and validation: §§4–5; individual statistics: §8; role-adjacent mode/character precedent: §11; **constant-skill but learned-rating bots: §12, p. 22**. [Publication page](https://www.microsoft.com/en-us/research/publication/trueskill-2-improved-bayesian-skill-rating-system/).
- **[G1]** Mark E. Glickman, [*Example of the Glicko-2 system*](https://www.glicko.net/glicko/glicko2.pdf), revised March 22, 2022. Author's definitions of rating deviation, volatility, rating periods, and paired-outcome updates.
- **[B1]** OpenAI et al., [*Dota 2 with Large Scale Deep Reinforcement Learning*](https://cdn.openai.com/dota-2.pdf), 2019, **Appendix J, p. 49**: reference-pool calibration, fixed reference ratings, stronger added references, and environmental metric drift.
- **[B2]** Chess.com Help Center, [*How can I play against the Chess.com bots?*](https://support.chess.com/en/articles/8614091-how-can-i-play-against-the-chess-com-bots), current help page: always-unrated bot/engine games and displayed strength levels.
- **[B3]** Lichess, [*Welcome Lichess Bots*](https://lichess.org/blog/WvDNticAAMu_mHKP/welcome-lichess-bots), May 8, 2018, updated with Board API notes. First-party historical policy precedent: rated bot challenges, leaderboard exclusion, and discussion of bot calibration.
- **[B4]** Lichess server source, [`RatingRegulator.scala`](https://github.com/lichess-org/lila/blob/master/modules/rating/src/main/RatingRegulator.scala) and [`PerfsUpdater.scala`](https://github.com/lichess-org/lila/blob/master/modules/round/src/main/PerfsUpdater.scala), `master` inspected on the research date. `halvedAgainstBot` handles non-bot-versus-bot updates; `PerfsUpdater` passes bot status to regulation. These are moving source links, not a pinned release guarantee.
- **[M1]** Microsoft Research, [*TrueMatch Matchmaking System*](https://www.microsoft.com/en-us/research/project/truematch/): rating-independent matchmaking and population-sensitive allowances.
- **[M2]** AWS GameLift Servers FlexMatch, [*Example: Create two teams with evenly matched players*](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-examples-1.html): supplied skill attributes, team-average constraints, and timed relaxation. Its equal-team example is not evidence of appropriate 6v4 balance.
- **[M3]** AWS GameLift Servers FlexMatch, [*Customize the match algorithm*](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-rulesets-components-algorithm.html), especially “Favor older tickets with expansions”; and [*Allow requirements to relax over time*](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-rulesets-components-expansion.html).
- **[M4]** AWS GameLift Servers FlexMatch, [*Backfill existing games*](https://docs.aws.amazon.com/gameliftservers/latest/flexmatchguide/match-backfill.html): existing-session backfill, automatic initial filling, and manual replacement after departures.
