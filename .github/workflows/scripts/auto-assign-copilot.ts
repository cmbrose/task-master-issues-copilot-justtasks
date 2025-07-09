import { Octokit } from "@octokit/rest";

const token = process.env.GITHUB_TOKEN!;
const [owner, repo] = process.env.REPO!.split("/");
const closedIssueNumber = Number(process.env.ISSUE_NUMBER);

const octokit = new Octokit({ auth: token });

function normalizeBody(body: string | undefined | null): string {
    if (!body) {
        return "";
    }

    // Try to extract the original body from an HTML comment block
    const match = body.match(/<!--\s*ORIGINAL ISSUE BODY \(before reformat\):([\s\S]*?)-->/i);
    if (match) {
        // Unescape any &lt;!-- and --&gt; back to <!-- and -->
        let original = match[1].trim();
        original = original.replace(/&lt;!--/g, '<!--').replace(/--&gt;/g, '-->');
        return original;
    }

    // Use a global regex to remove all non-letter, non-colon, non-space, non-hyphen characters
    return body.replace(/[^a-zA-Z0-9:\s#-]/g, '');
}

function parseRequiredBy(body: string): number[] {
  const match = body.match(/- Required By:\s+([\s\S]+?)(?:\n[^\s-]|$)/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/#(\d+)/g)).map(m => Number(m[1]));
}

function parseDependencies(body: string): number[] {
  const match = body.match(/## Dependencies\s+([\s\S]+?)(?:\n[^\s-]|$)/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/#(\d+)/g)).map(m => Number(m[1]));
}

async function getSubIssues(issueNumber: number): Promise<number[]> {
    const { data: subIssues } = await (octokit.issues as any).listSubIssues({ owner, repo, issue_number: issueNumber });
    return subIssues.map((i: any) => i.number);
}

async function isClosed(issueNumber: number): Promise<boolean> {
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
  return issue.state === "closed";
}

async function findParentIssueOfSubissue(body: string): Promise<number | undefined> {
    const match = body.match(/- Parent Task: #(\d+)/);
    if (match) {
        return Number(match[1]);
    }
    return undefined;
}

async function getCopilotBotId(): Promise<string | undefined> {
  const query = `
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
          nodes {
            login
            __typename
            ... on Bot { id }
            ... on User { id }
          }
        }
      }
    }
  `;
  const result = await octokit.graphql<any>(query, { owner, name: repo });
  const nodes = result.repository.suggestedActors.nodes;
  const copilot = nodes.find((n: any) => n.login === 'copilot-swe-agent');
  return copilot?.id;
}

async function getIssueNodeId(issueNumber: number): Promise<string | undefined> {
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        issue(number: $number) {
          id
          title
        }
      }
    }
  `;
  const result = await octokit.graphql<any>(query, { owner, name: repo, number: issueNumber });
  return result.repository.issue?.id;
}

async function assignCopilotViaGraphQL(issueNumber: number) {
  const copilotId = await getCopilotBotId();
  if (!copilotId) {
    console.log('Copilot bot not found in suggestedActors.');
    return;
  }
  const issueId = await getIssueNodeId(issueNumber);
  if (!issueId) {
    console.log(`Issue node id not found for issue #${issueNumber}`);
    return;
  }
  const mutation = `
    mutation($assignableId: ID!, $actorIds: [ID!]!) {
      replaceActorsForAssignable(input: {assignableId: $assignableId, actorIds: $actorIds}) {
        assignable {
          ... on Issue {
            id
            title
            assignees(first: 10) {
              nodes { login }
            }
          }
        }
      }
    }
  `;
  await octokit.graphql(mutation, { assignableId: issueId, actorIds: [copilotId] });
  console.log(`Assigned Copilot (GraphQL) to issue #${issueNumber}`);
}

async function checkAndAssignCopilot(issueNumber: number) {
  const { data: issue } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });

  if (issue.state === 'closed') {
    console.log(`Issue #${issueNumber} is already closed. Skipping assignment.`);
    return;
  }

  const body = normalizeBody(issue.body);

  const dependencies = parseDependencies(body);
  const allDepsClosed = await Promise.all(dependencies.map(isClosed)).then(arr => arr.every(Boolean));

  const subIssues = await getSubIssues(issueNumber);
  const allSubsClosed = await Promise.all(subIssues.map(isClosed)).then(arr => arr.every(Boolean));

  if (allDepsClosed && allSubsClosed) {
    await assignCopilotViaGraphQL(issueNumber);
  }

  if (allDepsClosed && !allSubsClosed) {
    for (const subIssue of subIssues) {
        await checkAndAssignCopilot(subIssue);
    }
  }
}

async function main() {
  // 1. Fetch the closed issue
  const { data: closedIssue } = await octokit.issues.get({ owner, repo, issue_number: closedIssueNumber });

  const body = normalizeBody(closedIssue.body);

  // 2. Find all issues that require it
  const requiredBy = parseRequiredBy(body);
  for (const reqIssueNumber of requiredBy) {
    await checkAndAssignCopilot(reqIssueNumber);
  }

  // 3. If this issue is a subissue, find its parent(s) and check them
  const parentNumber = await findParentIssueOfSubissue(body);
  if (parentNumber !== undefined) {
    await checkAndAssignCopilot(parentNumber);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});