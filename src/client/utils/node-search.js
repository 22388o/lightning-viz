module.exports = {
  search,
  validate,
};

function validate(input) {
  if (!input) return true;
}

function search(graph, input) {
  if (!input) return graph.nodes;
  let tokens = tokenize(input);
  let parseTree = buildParseTree(tokens);
  return filterByTreeNode(graph.nodes, parseTree);
}

function tokenize(input) {
  let tokens = [];
  let match;

  function advance(len) {
    input = input.substr(len);
  }

  function pushAdvance(token, len) {
    tokens.push(token);
    advance(len);
  }

  while (input.length) {
    if (input.match(/^ /)) advance(1);
    else if (input.match(/^\(/)) pushAdvance({ type: 'open_paren' }, 1);
    else if (input.match(/^\)/)) pushAdvance({ type: 'close_paren' }, 1);
    else if (input.match(/^,/)) pushAdvance({ type: 'comma' }, 1);
    else if (input.match(/^and /)) pushAdvance({ type: 'and' }, 3);
    else if (input.match(/^or /)) pushAdvance({ type: 'or' }, 2);
    else if (input.match(/^=/)) pushAdvance({ type: 'eq' }, 2);
    else if (input.match(/^>/)) pushAdvance({ type: 'gt' }, 1);
    else if (input.match(/^</)) pushAdvance({ type: 'lt' }, 1);
    else if (input.match(/^>=/)) pushAdvance({ type: 'gte' }, 1);
    else if (input.match(/^<=/)) pushAdvance({ type: 'lte' }, 1);
    else if (input.match(/^in /)) pushAdvance({ type: 'in' }, 2);
    else if (input.match(/^like /)) pushAdvance({ type: 'like' }, 4);
    else if ((match = input.match(/^(true|false)/)))
      pushAdvance({ type: 'bool', value: match[0] == 'true' }, match[0].length);
    else if ((match = input.match(/^[0-9]+/)))
      pushAdvance({ type: 'int', value: parseInt(match[0]) }, match[0].length);
    else if ((match = input.match(/^'.*?'/)))
      pushAdvance({ type: 'string', value: match[0].replace(/'/g, '') }, match[0].length);
    else if ((match = input.match(/^[a-z_]+/)))
      pushAdvance({ type: 'property', value: match[0] }, match[0].length);
    else throw new Error('Invalid token');
  }
  return tokens;
}

function buildParseTree(tokens) {
  let stack = [];
  for (let token of tokens) {
    //console.log(JSON.stringify(stack.slice().reverse(), null, 2));
    let { type, value } = token;

    if (type === 'close_paren') {
      if (stack.length === 1) continue; // no-op for things like (is_required = 1)
      if (stack[stack.length - 1].type === 'in') continue;
      let right = stack.pop();
      stack[stack.length - 1].right = right;
    } else if (type === 'property') stack.push({ type, value, left: undefined, right: undefined });
    else if (type === 'and' || type === 'or')
      stack.push({ type, left: stack.pop(), right: undefined });
    else if (
      type === 'eq' ||
      type === 'lt' ||
      type === 'gt' ||
      type === 'lte' ||
      type === 'gte' ||
      type === 'like'
    )
      stack.push({ type, left: stack.pop(), right: undefined });
    else if (type === 'in')
      stack.push({
        type,
        left: stack.pop(),
        right: { type: 'array', value: [], left: undefined, right: undefined },
      });
    else if (type === 'string' || type === 'bool' || type === 'int')
      if (stack[stack.length - 1].type === 'in') stack[stack.length - 1].right.value.push(value);
      else stack[stack.length - 1].right = { type, value, left: undefined, right: undefined };
  }

  let result = stack.pop();
  while (stack.length) {
    stack[stack.length - 1].right = result;
    result = stack.pop();
  }

  return result;
}

function filterByTreeNode(nodes, parseNode) {
  if (parseNode.type === 'and') {
    let leftNodes = new Set(filterByTreeNode(nodes, parseNode.left));
    let rightNodes = new Set(filterByTreeNode(nodes, parseNode.right));
    let results = [];
    for (let node of leftNodes.values()) {
      if (rightNodes.has(node)) results.push(node);
    }
    return results;
  }

  if (parseNode.type === 'or') {
    let leftNodes = filterByTreeNode(nodes, parseNode.left);
    let rightNodes = filterByTreeNode(nodes, parseNode.right);
    return Array.from(new Set(leftNodes.concat(rightNodes)));
  }

  if (parseNode.type === 'eq') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    return nodes.filter(node => getNodeValue(node, prop) === value);
  }

  if (parseNode.type === 'gt') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    return nodes.filter(node => getNodeValue(node, prop) > value);
  }

  if (parseNode.type === 'gte') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    return nodes.filter(node => getNodeValue(node, prop) >= value);
  }

  if (parseNode.type === 'lt') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    return nodes.filter(node => getNodeValue(node, prop) < value);
  }

  if (parseNode.type === 'lte') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    return nodes.filter(node => getNodeValue(node, prop) <= value);
  }

  if (parseNode.type === 'like') {
    let prop = parseNode.left.value;
    let value = parseNode.right.value;
    value = value.replace(/[-[\]/{}()+?.\\^$|]/g, '\\$&');
    value = value.replace(/\*/g, '.*?');
    value = new RegExp('^' + value);
    return nodes.filter(node => getNodeValue(node, prop).match(value));
  }

  if (parseNode.type === 'in') {
    let prop = parseNode.left.value;
    let values = new Set(parseNode.right.value);
    return nodes.filter(node => values.has(getNodeValue(node, prop)));
  }
}

function getNodeValue(node, prop) {
  switch (prop) {
    case 'alias':
      return node.alias;
    case 'is_reachable':
      return node.is_reachable;
    case 'country':
      return node.geo_info && node.geo_info.country_code;
    case 'channels':
      return node.channels;
    case 'capacity':
      return node.capacity;
  }
}
