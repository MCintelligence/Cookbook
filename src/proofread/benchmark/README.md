# Seasonings benchmark

`benchmark.test.ts` scores Salty Sam and Peppery Pete on these sets with every check at its default setting.

- `learner.txt`: 129 sentences, one mistake each, in the same categories and counts as the simple-sentence set of John & Woll (2020), which scored Microsoft Word, Grammarly and Virtual Writing Tutor. Their sentences are not published, so these are Cookbook's own.
- `heldout.txt`: 55 more in the same categories, written after the checks were finished and scored once with no tuning, as an honest check against fitting the test.
- `writer.txt`: 71 mistakes in the categories of Word's published Grammar Settings list (capitals, agreement, punctuation around speech, hyphens and so on).
- `clean.txt`: 149 correct sentences that look like mistakes. Every underline here is a false alarm.

A mistake is found when an underline touches its marked words, and fixed when the first suggestion gives the right sentence. Run `BENCH_OUT=report.txt npx vitest run src/proofread/benchmark.test.ts` for the full report.

Word's figures come only from published sources, never from running Word or its files:
John, P., & Woll, N. (2020). Using grammar checkers in an ESL context: An investigation of automatic corrective feedback. *CALICO Journal*, 37(2), 169–192. https://doi.org/10.1558/cj.36523
