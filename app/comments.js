const { BOT_NAME: botName } = process.env;
const { passCommentText } = require('./report');

/**
 * Attempts to update a previous comment or creates a new one
 * @param {object} context The github context
 * @param {integer} issue_number The pull request number
 * @param {string} body The comment body
 */
async function processComment(context, issue_number, body) {
  const { data = [] } = await context.github.issues.listComments(
    context.repo({
      issue_number
    })
  );

  let method = 'createComment';
  let params = {
    issue_number,
    body
  };
  let previousComment;

  data.some(({ id: comment_id, user: { login = '' }, body: commentBody = '' }) => {
    if (login === `${botName}[bot]`) {
      params = { ...params, comment_id };
      previousComment = commentBody;
      method = 'updateComment';
      return true;
    }
    return false;
  });

  // If all tests passed, and either a comment has not been posted
  // or the previous comment update, was also succesful, skip update
  if (body === passCommentText && (!previousComment || previousComment === passCommentText)) {
    return true;
  }

  await context.github.issues[method](context.repo(params));

  return true;
}

module.exports = processComment;
