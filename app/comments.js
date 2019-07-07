const { BOT_NAME: botName } = process.env;

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

  data.some(({ id: comment_id, user: { login = '' } }) => {
    if (login === botName) {
      params = { ...params, comment_id };
      method = 'updateComment';
      return true;
    }
    return false;
  });

  await context.github.issues[method](context.repo(params));
}

module.exports = processComment;
