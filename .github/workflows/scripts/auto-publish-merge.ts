import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";

const graphQlToken = process.env.GITHUB_GRAPHQL_TOKEN;
const mergeToken = process.env.GITHUB_MERGE_TOKEN;
const prNumber = process.env.PR_NUMBER;
const repoFull = process.env.REPO;

if (!graphQlToken || !mergeToken || !repoFull) {
  console.error("Missing required environment variables: GITHUB_TOKEN, REPO");
  process.exit(1);
}

const [owner, repo] = repoFull.split("/");
// The PR is merged with a human's PAT so that it will trigger the auto-assign-copilot job, but 
// GraphQL doesn't like the fine-grained token - so we need two tokens :shrug:
const graphqlWithAuth = graphql.defaults({ headers: { authorization: `token ${graphQlToken}` } });
const octokit = new Octokit({ auth: mergeToken });

async function processPR(prNum: number) {
  try {
    // Get PR details
    let { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNum,
    });

    if (pr.mergeable) {
        return;
    }

    const prNodeId = pr.node_id;

    // Check if cmbrose is a requested reviewer
    const reviewers = pr.requested_reviewers?.map((r: any) => r.login) || [];
    if (!reviewers.includes("cmbrose")) {
      console.log(`PR #${prNum}: cmbrose is not a requested reviewer, skipping.`);
      return;
    }

    // Publish if draft
    if (pr.draft) {
      await graphqlWithAuth(
        `mutation MarkReady($prId: ID!) {
          markPullRequestReadyForReview(input: {pullRequestId: $prId}) {
            pullRequest { id isDraft }
          }
        }`,
        { prId: prNodeId }
      );
      console.log(`PR #${prNum}: Published draft PR`);
    } else {
      console.log(`PR #${prNum}: PR is already published`);
    }

    if (pr.mergeable === null) {
        // It's recalculating from a recent merge, probably from this workflow. Wait a few seconds
        console.log(`PR #${prNum}: unknown mergeable state, waiting for it to normalize`);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const res = await octokit.pulls.get({
            owner,
            repo,
            pull_number: prNum,
        });
        pr = res.data;
    }

    if (pr.mergeable === true) {
        // Merge the PR
        await octokit.pulls.merge({
            owner,
            repo,
            pull_number: prNum,
            merge_method: "squash", // or 'merge' or 'rebase'
        });
        console.log(`PR #${prNum}: Merged PR`);
    } else if (pr.mergeable === false) {
        // unassign cmbrose as a reviewer
        await octokit.pulls.removeRequestedReviewers({
            owner,
            repo,
            pull_number: prNum,
            reviewers: ["cmbrose"],
        });
        console.log(`PR #${prNum}: Unassigned cmbrose as a reviewer due to merge conflict.`);

        // kick off a workflow to tell copilot to handle the conflict
        await octokit.repos.createDispatchEvent({
            owner,
            repo,
            event_type: "copilot_conflict",
            client_payload: {
                pr_number: prNum,
            },
        });
        console.log(`PR #${prNum}: Triggered copilot conflict workflow.`);
    } else {
        console.log(`PR #${prNum}: Mergeable state is still unknown, skipping to try again later`);
    }
  } catch (err) {
    console.error(`Error processing PR #${prNum}:`, err);
  }
}

async function main() {
    const user = await octokit.users.getAuthenticated();
    console.log("Authenticated as:", user.data.login);

  if (prNumber) {
    await processPR(Number(prNumber));
  } else {
    // No PR_NUMBER: poll all open PRs
    try {
      let page = 1;
      let processed = 0;
      while (true) {
        const { data: prs } = await octokit.pulls.list({
          owner,
          repo,
          state: "open",
          per_page: 100,
          page,
        });
        if (prs.length === 0) break;
        for (const pr of prs) {
          await processPR(pr.number);
          processed++;
        }
        if (prs.length < 100) break;
        page++;
      }
      if (processed === 0) {
        console.log("No open PRs found.");
      }
    } catch (err) {
      console.error("Error listing open PRs:", err);
      process.exit(1);
    }
  }
}

main(); 