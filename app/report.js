const { detailsSummary } = require('./util');

function prepareReport(order, reports) {
  let reportSummary = '';
  let warningsFound = false;
  const commentStats = {
    '⬆️': {
      body: '',
      count: 0,
      summary: '<b>Improvements: <i>{text}</i></b> 🚀',
      options: {
        detailTag: '<details open>'
      }
    },
    '⚠️': { body: '', count: 0, summary: '<b>Warnings: <i>{text}</i></b>' },
    '❌': { body: '', count: 0, summary: '<b>Errors: <i>{text}</i></b>' }
  };

  order.forEach(route => {
    const result = reports.get(route);
    if (!result) return;
    const { stats = {}, report = '' } = result;
    reportSummary += report;
    Object.entries(stats).forEach(([icon, { output = '' }]) => {
      const comment = commentStats[icon];
      if (!comment || !output) return;
      comment.count += 1;
      comment.body += output;
      if (icon === '⚠️') {
        warningsFound = true;
      }
    });
  });

  let commentSummary = Object.values(commentStats).reduce(
    (output, { summary, body, count, options = {} }) => {
      if (!body) return output;
      const text = `${count} URL${count > 1 ? 's' : ''}`;
      output += detailsSummary(summary.replace('{text}', text), body, {
        includeLineBreak: false,
        ...options
      });
      return output;
    },
    ''
  );

  if (commentSummary) {
    commentSummary = `# 🚢 Lightkeeper Report\n${commentSummary}`;
  }

  const getTitle = (conclusion, errors, warnings) => {
    let title = '';
    const urlText = `${order.length} URL${order.length > 1 ? 's' : ''}`;
    const errorsFound = `${errors} error${errors > 1 ? 's' : ''}`;

    switch (conclusion) {
      case 'failure':
        title = `Found ${errorsFound} across ${urlText}.`;
        break;
      case 'neutral':
        title = warnings && !errors ? '⚠️ Passed with warnings.' : '⚠️ Non-critical errors found.';
        break;
      default:
        title = 'All tests passed! See the full report. ➡️';
    }
    return title;
  };

  return {
    reportSummary,
    commentSummary,
    getTitle,
    warningsFound
  };
}

module.exports = prepareReport;
