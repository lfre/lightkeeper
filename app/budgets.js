const bytes = require('bytes');
const find = require('lodash.find');
const { detailsSummary } = require('./util');

const icons = ['⬆️', '✅', '⚠️', '❌'];

/**
 * Returns a stats object keyed by icon type
 */
function getStats() {
  return icons.reduce((collection, icon) => {
    collection[icon] = {
      total: 0,
      outputs: {
        categories: { output: '' },
        sizes: { output: '' },
        counts: { output: '' }
      }
    };
    return collection;
  }, {});
}

/**
 * Adds the line dividers for tables
 * @param {number} count The length of the table
 */
function tableDividers(count) {
  let lines = '';
  for (let i = 0; i < count; i += 1) {
    lines += '| - ';
  }
  if (lines) lines += '|';
  return lines;
}

/**
 * Creates a table row or header
 * @param {array} headings The row contents
 * @param {boolean} header If true, adds a divider
 */
function addRow(headings = [], header = false) {
  let output = `| ${headings.join(' | ')} |\n`;
  if (header) {
    output += `${tableDividers(headings.length)}\n`;
  }
  return output;
}

function checkFailure(score, target, asc) {
  return asc ? score < target : score > target;
}

function checkWarning(score, target, warning, asc) {
  return asc ? score <= target + warning : score >= target - warning;
}

function checkImprove(score, target, asc) {
  return asc ? score > target : score < target;
}

function runBudgets(
  score,
  { target, threshold, thresholdTarget, warning },
  handleFailure,
  asc = true
) {
  let pass = '✅';

  if (typeof warning !== 'number') {
    // set warning by default to 25% of threshold
    warning = Math.round((25 / 100) * threshold);
  }

  if (checkFailure(score, thresholdTarget, asc)) {
    pass = '❌';
    handleFailure();
    // add to error changes
  } else if (threshold && checkWarning(score, thresholdTarget, warning)) {
    pass = '⚠️';
    // add to warning changes
  } else if (checkImprove(score, target, asc)) {
    // add to improvements on changes
    pass = '⬆️';
  }

  return pass;
}

function addToStats(row, type, pass, stats, header) {
  const stat = stats[pass];
  const group = stat.outputs[type];
  const { hasHeader = false } = group;
  stat.total += 1;
  group.output += hasHeader ? row : `${header}${row}`;
  if (!hasHeader) {
    group.hasHeader = true;
  }
}

/**
 * Compares the response category scores against the budgets
 * @param {object} response The response object
 * @param {object} budgets The budgets object
 * @param {function} handleFailures The failure handler
 */
function processCategories(response, budgets, handleFailures) {
  if (typeof response !== 'object' || typeof budgets !== 'object') return '';

  return stats => {
    let output = '';
    const header = addRow(['Category', 'Score', 'Threshold', 'Target', 'Pass'], true);

    Object.values(response).forEach(({ id, score: sc, title }) => {
      const cat = budgets[id];
      if (!cat) return;
      let target = 0;
      let threshold = 0;
      let warning = null;
      if (typeof cat === 'number') {
        target = cat;
      }
      if (typeof cat === 'object') {
        ({ target = 0, warning, threshold = 0 } = cat);
      }
      if (!target || typeof target !== 'number') return;
      const thresholdTarget = target - threshold;

      if (thresholdTarget < 0) return;

      const score = Math.floor(sc * 100);
      const pass = runBudgets(
        score,
        {
          target,
          threshold,
          thresholdTarget,
          warning
        },
        handleFailures
      );

      const thresholdOutput = thresholdTarget === target ? '—' : thresholdTarget;
      const row = addRow([title, score, thresholdOutput, target, pass]);
      addToStats(row, 'categories', pass, stats, header);
      // add row to output
      output += row;
    });

    return output ? `${header}${output}` : '';
  };
}

/**
 * Joins all the different budget types
 * @param {string} type The budget type
 * @param {}
 */
function joinBudgetTypes(type, collection = {}) {
  return ({ resourceType, budget = 0, threshold = 0, warning = 0 }) => {
    const resource = collection[resourceType];
    if (!resource) {
      collection[resourceType] = { [type]: { budget, threshold, warning } };
      return;
    }
    collection[resourceType][type] = { budget, threshold, warning };
  };
}

/**
 * Compares the lightwallet response against the budgets
 * @param {object} response The response object
 * @param {object} budgets The budgets object
 * @param {function} handleFailures The failure handler
 */
function processLightWallet(response, budgets, handleFailures) {
  if (!Array.isArray(response) || !budgets.length) return '';
  const resourceOutputs = {
    sizes: {
      header: addRow(['Resource', 'Size', 'Threshold', 'Budget', 'Over Budget', 'Pass'], true),
      output: ''
    },
    counts: {
      header: addRow(
        ['Resource', 'Request Count', 'Threshold', 'Budget', 'Over Budget', 'Pass'],
        true
      ),
      output: ''
    }
  };

  const collection = {};
  budgets.forEach(({ resourceSizes = [], resourceCounts = [] }) => {
    // groups both type of budgets so it can be compared together
    resourceSizes.forEach(joinBudgetTypes('sizeBudgets', collection));
    resourceCounts.forEach(joinBudgetTypes('countBudgets', collection));
  });
  return stats => {
    Object.entries(collection).forEach(([resourceType, { sizeBudgets, countBudgets }]) => {
      const { label, size: responseSize, requestCount } = find(response, { resourceType });
      [[responseSize, sizeBudgets, 'sizes'], [requestCount, countBudgets, 'counts']].forEach(
        ([score, resourceBudget, type]) => {
          if (score && resourceBudget) {
            const { budget: target, threshold, warning } = resourceBudget;
            const thresholdTarget = target + threshold;
            if (thresholdTarget < 0) return;

            let suffix = '';
            let rowScore = score;
            let over = '';

            if (type === 'sizes') {
              // convert to correct unit for display
              rowScore = bytes(score);
              // convert to kb for comparisons
              score = Math.floor(score / 1024 ** 1);
              suffix = 'kb';
            }
            over = score - target;
            if (over < 0) {
              over = 0;
            }
            const pass = runBudgets(
              score,
              {
                target,
                thresholdTarget,
                threshold,
                warning
              },
              handleFailures,
              false
            );

            const thresholdOutput =
              thresholdTarget === target ? '—' : `${thresholdTarget}${suffix}`;
            const row = addRow([
              label,
              rowScore,
              thresholdOutput,
              `${target}${suffix}`,
              `${over}${suffix}`,
              pass
            ]);
            const { header } = resourceOutputs[type];
            addToStats(row, type, pass, stats, header);
            // add row to output
            resourceOutputs[type].output += row;
          }
        }
      );
    });
    return Object.values(resourceOutputs).reduce((result, { header, output }) => {
      if (result && output) {
        result += `\n${header}${output}`;
      } else {
        result += `${header}${output}`;
      }
      return result;
    }, '');
  };
}

function processBudgets(urlRoute, stats, budgets = []) {
  let reportOutput = '';
  budgets.forEach(runBudget => {
    if (!runBudget) return;
    const output = runBudget(stats);
    if (reportOutput && output) {
      reportOutput += `\n${output}`;
    } else {
      reportOutput += output;
    }
  });
  // process the stats to generate the summary
  // and process the body for comments
  const statsOutput = Object.entries(stats).reduce((statsSummary, [icon, { total, outputs }]) => {
    // add up the different outputs from budgets
    const output = Object.values(outputs).reduce((accOutput, { output: budgetOutput }) => {
      if (accOutput && budgetOutput) {
        accOutput += `\n${budgetOutput}`;
      } else {
        accOutput += budgetOutput;
      }
      return accOutput;
    }, '');
    // clear raw outputs
    delete stats[icon].outputs;
    const iconSummary = ` <b>${total}</b> ${icon}`;
    if (total > 0) {
      statsSummary += iconSummary;
    }
    if (!output) return statsSummary;
    stats[icon].output = detailsSummary(
      `<b>URL - </b><i>${urlRoute}</i><p>&nbsp; &nbsp; <b>Summary — </b> ${iconSummary}`,
      output
    );
    return statsSummary;
  }, '');

  return {
    reportOutput,
    stats,
    statsOutput
  };
}

module.exports = {
  getStats,
  processBudgets,
  processCategories,
  processLightWallet
};
