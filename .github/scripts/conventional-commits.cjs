const TYPES = ['feat', 'fix', 'perf', 'refactor', 'style', 'test', 'docs', 'build', 'ci', 'chore', 'revert'];
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9][a-z0-9-]*)\))?!?: (?<description>\S.*)$/;
const MAX_LENGTH = 100;

function headerProblem(header) {
    const match = HEADER.exec(header);
    if (!match) return 'expected "type(scope): description"';
    if (!TYPES.includes(match.groups.type)) return `type must be one of ${TYPES.join(', ')}`;
    if (header.length > MAX_LENGTH) return `keep it under ${MAX_LENGTH + 1} characters`;
    return null;
}

function findProblems({ title, commits }) {
    const problems = [];
    const titleProblem = headerProblem(title);
    if (titleProblem) problems.push(`PR title "${title}": ${titleProblem}`);
    for (const commit of commits) {
        const header = commit.message.split('\n', 1)[0];
        const sha = commit.sha.slice(0, 8);
        if (commit.parents > 1) {
            problems.push(`${sha} "${header}": merge commit; update the branch with a rebase instead`);
        } else if (/^(fixup|squash|amend)! /.test(header)) {
            problems.push(`${sha} "${header}": fold it in with git rebase -i --autosquash`);
        } else {
            const problem = headerProblem(header);
            if (problem) problems.push(`${sha} "${header}": ${problem}`);
        }
    }
    return problems;
}

async function checkPullRequest({ github, context, core }) {
    const pull = context.payload.pull_request;
    const commits = await github.paginate(github.rest.pulls.listCommits, {
        ...context.repo, pull_number: pull.number, per_page: 100,
    });
    const problems = findProblems({
        title: pull.title,
        commits: commits.map((c) => ({ sha: c.sha, message: c.commit.message, parents: c.parents.length })),
    });
    for (const problem of problems) core.error(problem);
    if (problems.length) core.setFailed('Use conventional commits for the PR title and every commit. See AGENTS.md.');
}

module.exports = { TYPES, headerProblem, findProblems, checkPullRequest };
