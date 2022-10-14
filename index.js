//---------------------------- Integration with HTML file --------------------------
document.addEventListener('DOMContentLoaded', () => {

  const grammarText = document.getElementById('grammar-text');
  const inputText = document.getElementById('input-text');
  const containers = {
    grammar: document.getElementById('grammar-container'),
    collection: document.getElementById('collection-container'),
    parseTable: document.getElementById('parse-table-container'),
    parseSteps: document.getElementById('parse-steps-container'),
    parseTree: document.getElementById('parse-tree-container'),
  };
  const parseContainers = {
    parseSteps: document.getElementById('parse-steps-container'),
    parseTree: document.getElementById('parse-tree-container'),
  };

  const emptyParseContainers = ()=>{
    Object.keys(parseContainers).forEach(key => {
        parseContainers[key].innerHTML = '';
      });
  };

  const emptyContainers = () => {
    Object.keys(containers).forEach(key => {
      containers[key].innerHTML = '';
    });
  };

  const createParserHTML = () => {
    clear();
    emptyContainers();
    if(grammarText.value.trim()===""){
        return;
    }
    createParser(grammarText.value);
    renderGrammar(containers.grammar);
    renderCollection(containers.collection);
    renderParseTable(containers.parseTable);
  };

  const parseHTML = () => {
    if(inputText.value.trim()===""){
        return;
    }
    parse(inputText.value);
    renderParseSteps(containers.parseSteps);
    renderParseTree(containers.parseTree);
  };

  const showExample = () => {
    clearHTML();
    grammarText.value = sampleGrammar();
    createParserHTML();
    inputText.value = sampleInput();
    parseHTML();
  };

  const clearHTML = () => {
    grammarText.value = '';
    inputText.value = '';
    emptyContainers();
    clear();
  };
 
  const clearParsingHTML = ()=>{
    inputText.value = "";
    emptyParseContainers();
    clearParsing();
  };

  document.getElementById('create-parser').addEventListener('click', createParserHTML);
  document.getElementById('parse').addEventListener('click', parseHTML);
  document.getElementById('show-example').addEventListener('click', showExample);
  document.getElementById('clear').addEventListener('click', clearHTML);
  document.getElementById('clear-parsing').addEventListener('click',clearParsingHTML);
});
//---------------------------- X --------------------------

//---------------------------- Parsing logic --------------------------
let grammarRules = [];
let symbols = [];
let countVariables = 0;
let collection = [];
let parseTable;
let parseTableHasConflict = false;
let followStack = [];
let firstStack = [];
let trace = [];

//---------------------------- Helper Functions ------------------------------------------
const isNonTerminal = (symbolIndex) => {
    return symbolIndex >= 0 && symbolIndex < countVariables;
};

const isTerminal = symbol => {
    return symbol >= countVariables && symbol < symbols.length - 1
};

const areItemsEqual = (i1, i2) => {
    return i1.rule === i2.rule && i1.dot === i2.dot;
};

const areSetsEqual = (s1, s2) => {
    if (s1.length !== s2.length) {
        return false;
    }
    let isEqual = true;
    for (let i = 0; i < s1.length; i++) {
        let found = false;
        for (let j = 0; j < s2.length; j++) {
            if (areItemsEqual(s1[i], s2[j])) {
                found = true;
                break;
            }
        }
        if (!found) {
            isEqual = false;
        }
    }
    return isEqual;
};

const areActionsEqual = (a1, a2) => {
    //Don't check for state in accept
    if (a1.type === "accept" && a2.type === "accept") {
        return true;
    }

    //Conflict may have list of actions
    if (a1.type === "conflict" || a2.type === "conflict") {
        return false;
    }

    return a1.type === a2.type && a1.state === a2.state;

};
//---------------------------- X ------------------------------------------

//---------------------------- Functions to find first ------------------------------------------
const initializeFirst = () => {
    firstStack = Array(symbols.length);
    for (let i = 0; i < firstStack.length; i++) {
        firstStack[i] = false;
    }
};

const first = (symbol) => {
    if (isTerminal(symbol)) {
        return [symbol];
    }
    //To handle repeated recursion
    if (firstStack[symbol]) {
        return [];
    }
    firstStack[symbol] = true;
    let out = [];
    for (let i = 0; i < grammarRules.length; i++) {
        //Take care of recursive rules
        if (grammarRules[i].lhs === symbol) {
            //Not considering ^
            let fi = first(grammarRules[i].rhs[0]);
            for (let j = 0; j < fi.length; j++) {
                out.push(fi[j]);
            }
        }
    }
    return out;

};
//---------------------------- X -----------------------------------------

//---------------------------- Functions to find follow ------------------------------------------
const initializeFollow = () => {
    followStack = Array(symbols.length);
    for (let i = 0; i < followStack.length; i++) {
        followStack[i] = false;
    }
};

const follow = (symbol) => {
    let followSet = [];

    //To handle repeated recursion
    if (followStack[symbol]) {
        return [];
    }
    followStack[symbol] = true;
    if (symbol === 0) {
        //Add $ in follow of start symbol
        followSet.push(symbols.length - 1)
    }
    for (let i = 0; i < grammarRules.length; i++) {
        let lhs = grammarRules[i].lhs;
        for (let j = 0; j < grammarRules[i].rhs.length; j++) {
            if (grammarRules[i].rhs[j] === symbol) {
                if (j === grammarRules[i].rhs.length - 1) {
                    if (lhs !== symbol) {
                        let fo = follow(lhs);
                        for (let k = 0; k < fo.length; k++) {
                            if (!followSet.includes(fo[k])) {
                                followSet.push(fo[k]);
                            }
                        }
                    }
                } else {
                    initializeFirst();
                    let fi = first(grammarRules[i].rhs[j + 1]);
                    for (let k = 0; k < fi.length; k++) {
                        if (!followSet.includes(fi[k])) {
                            followSet.push(fi[k]);
                        }
                    }
                }
            }
        }
    }
    return followSet;
};
//---------------------------- X ------------------------------------------

//---------------------------- Functions to create parsing table ------------------------------------------
const closure = (set) => {
    let itemSet = [...set];
    for (let i = 0; i < itemSet.length; i++) {
        //If dot is at end, continue
        if (itemSet[i].rule.rhs.length === itemSet[i].dot) {
            continue;
        }
        let symbol = itemSet[i].rule.rhs[itemSet[i].dot];
        if (isNonTerminal(symbol)) {
            for (let j = 0; j < grammarRules.length; j++) {
                if (grammarRules[j].lhs === symbol) {
                    let item = {
                        rule: grammarRules[j], dot: 0,
                    };
                    let isNewItem = true;
                    for (let k = 0; k < itemSet.length; k++) {
                        if (areItemsEqual(item, itemSet[k])) {
                            isNewItem = false;
                            break;
                        }
                    }
                    if (isNewItem) {
                        itemSet.push(item);
                    }
                }
            }
        }
    }
    return itemSet;
};

const goTo = (itemSet, symbol) => {
    let out = [];
    for (let i = 0; i < itemSet.length; ++i) {
        //If dot is at end, continue
        if (itemSet[i].rule.rhs.length === itemSet[i].dot) {
            continue;
        }
        if (itemSet[i].rule.rhs[itemSet[i].dot] === symbol) {
            out.push({
                rule: itemSet[i].rule, dot: itemSet[i].dot + 1,
            });
        }
    }
    return closure(out);
};

const createCollection = () => {
    collection = [closure([{
        rule: grammarRules[0], dot: 0,
    }])];
    for (let i = 0; i < collection.length; i++) {
        //Symbols except $
        for (let j = 0; j < symbols.length - 1; j++) {
            let goToSet = goTo(collection[i], j);
            if (goToSet.length > 0) {
                let alreadyExists = false;
                for (let i = 0; i < collection.length; i++) {
                    if (areSetsEqual(goToSet, collection[i])) {
                        alreadyExists = true;
                        break;
                    }
                }
                if (!alreadyExists) {
                    collection.push(goToSet);
                }
            }
        }
    }
};

const createTable = () => {
    parseTable = new Array(collection.length);
    parseTableHasConflict = false;

    for (let i = 0; i < collection.length; i++) {
        parseTable[i] = Array(symbols.length);
        //Shift Actions and Go To part of table
        for (let j = 0; j < symbols.length - 1; j++) {
            let goToSet = goTo(collection[i], j);
            let idx = -1;
            for (let k = 0; k < collection.length; k++) {
                if (areSetsEqual(goToSet, collection[k])) {
                    idx = k;
                    break;
                }
            }
            if (idx !== -1) {
                if (j < countVariables) {
                    parseTable[i][j] = idx;
                } else {
                    addToParseTable(i, j, {type: "shift", state: idx});
                }
            }
        }
        //Reduce Actions
        for (let j = 0; j < collection[i].length; j++) {
            if (collection[i][j].rule.rhs.length === collection[i][j].dot) {
                initializeFollow();
                let fo = follow(collection[i][j].rule.lhs);
                let idx = -1;
                for (let k = 0; k < grammarRules.length; k++) {
                    if (grammarRules[k] === collection[i][j].rule) {
                        idx = k;
                    }
                }
                for (let k = 0; k < fo.length; k++) {
                    if (idx === 0) {
                        addToParseTable(i, symbols.length - 1, {type: "accept"});
                    } else {
                        addToParseTable(i, fo[k], {type: "reduce", state: idx});
                    }

                }
            }
        }
    }
};

const formatRules = (lineWiseSymbols) => {
    for (let i = 0; i < lineWiseSymbols.length; i++) {
        grammarRules[i] = {
            index: i, rhs: [],
        };
        for (let j = 0; j < lineWiseSymbols[i].length; j++) {
            if (j === 0) {
                grammarRules[i].lhs = symbols.indexOf(lineWiseSymbols[i][j]);
            } else {
                grammarRules[i].rhs.push(symbols.indexOf(lineWiseSymbols[i][j]));
            }
        }
    }
};


const createParser = (input) => {
    //Regular expression to split input into lines with one or more end character
    //\r - Carriage return character
    //\r\n - Essentially takes you to start of next line
    let lines = input.trim().split(/[\r\n]+/);
    let lineWiseSymbols = [];
    for (let i = 0; i < lines.length; i++) {
        //Split each line by spaces
        lineWiseSymbols[i] = lines[i].trim().split(/\s+/);
    }
    //Augment the grammar
    let startSymbol = lineWiseSymbols[0][0];
    lineWiseSymbols.unshift(["S'", startSymbol]);
    symbols = [];
    //Add non-terminals to symbols
    for (let i = 0; i < lineWiseSymbols.length; i++) {
        if (!symbols.includes(lineWiseSymbols[i][0])) {
            symbols.push(lineWiseSymbols[i][0]);
            countVariables++;
        }
    }
    //Add terminals to symbols
    for (let i = 0; i < lineWiseSymbols.length; i++) {
        for (let j = 1; j < lineWiseSymbols[i].length; j++) {
            if (!symbols.includes(lineWiseSymbols[i][j])) {
                symbols.push(lineWiseSymbols[i][j]);
            }
        }
    }

    //For parse table
    symbols.push("$");
    //Represent each grammar rule in terms of indices of the constituents in the allSymbolTable
    formatRules(lineWiseSymbols);
    createCollection();
    createTable();
};
//---------------------------- X ------------------------------------------

//---------------------------- Functions to parse given string ------------------------------------------

const formatInput = (input) => {
    let arr = input.trim().split(/\s+/);
    let out = [];
    for (let i = 0; i < arr.length; i++) {
        let idx = symbols.indexOf(arr[i]);
        if (isNonTerminal(idx)) {
            return false;
        }
        out.push(idx);
    }
    //Add $
    out.push(symbols.length - 1);
    return out;
}

const addToParseTable = (state, symbol, action) => {
    if (parseTable[state][symbol] === undefined) {
        parseTable[state][symbol] = action;
    } else if (parseTable[state][symbol].type === "conflict") {
        //Existing conflict at this space
        let newAction = true;
        for (let i = 0; i < parseTable[state][symbol].actions.length; i++) {
            if (areActionsEqual(action, parseTable[state][symbol].actions[i])) {
                newAction = false;
                break;
            }
        }
        if (newAction) {
            parseTable[state][symbol].actions.push(action);
        }
    } else if (!areActionsEqual(parseTable[state][symbol], action)) {
        //There is a conflict
        parseTable[state][symbol] = {
            type: "conflict",
            actions: [parseTable[state][symbol], action]
        };
        parseTableHasConflict = true;
    }

};

const parse = (inputString) => {
    if (parseTable === undefined) {
        return;
    }
    trace = [];
    if (parseTableHasConflict) {
        trace.push({
            stack: [],
            input: [],
            action: {
                type: 'Error',
                error: ' Conflict in parse table'
            }
        });
        return;
    }
    let stack = [0];
    //Convert input terminals to indices in symbols table
    let input = formatInput(inputString);
    if (input === false) {
        trace.push({
            stack: stack.slice(0),
            input: input.slice(0),
            action: {
                type: 'Error',
                error: ' Input string is invalid'
            }
        });
        return;
    }
    while (true) {
        let action = parseTable[stack[stack.length - 1]][input[0]];
        if (action === undefined) {
            trace.push({
                stack: stack,
                input: input,
                action: {
                    type: 'Error',
                    error: ' Syntax Error'
                }
            });
            return;
        }
        trace.push({
            stack: stack.slice(0),
            input: input.slice(0),
            action: action
        });
        if (action.type === "shift") {
            stack.push(input.shift());
            stack.push(action.state);
        } else if (action.type === "reduce") {
            for (let i = 0; i < 2 * grammarRules[action.state].rhs.length; i++) {
                stack.pop();
            }
            let lhs = grammarRules[action.state].lhs;
            stack.push(lhs);
            stack.push(parseTable[stack[stack.length - 2]][lhs]);
        } else if (action.type === "accept") {
            return;
        }
    }

};

//---------------------------- X ------------------------------------------


//---------------------------- Function to build parse tree  ------------------------------------------
const getParseTree = () => {
    let node;
    let isRoot = true;
    for (let i = trace.length - 1; i >= 0; i--) {
        if (trace[i].action.type === 'reduce') {
            if (isRoot) {
              node = {
                    symbol: grammarRules[trace[i].action.state].lhs,
                    children: []
                };
                isRoot = false;
            }
            addRuleToParseTree(node, grammarRules[trace[i].action.state]);
        }
    }
    return node;
};

const addRuleToParseTree = (node, rule) => {
    if (node.symbol === rule.lhs && node.children.length === 0) {
        for (let i = 0; i < rule.rhs.length; ++i) {
          node.children.push({
                symbol: rule.rhs[i],
                children: []
            });
        }
        return true;
    }
    for (let i = node.children.length - 1; i >= 0; --i) {
        if (addRuleToParseTree(node.children[i], rule)) {
            return true;
        }
    }
    return false;
};
//---------------------------- X ------------------------------------------

//---------------------------- Functions to convert actions/symbols to strings ------------------------------------------
const actionStr = action => {
    switch (action.type) {
        case 'accept':
            return 'A';
        case 'shift':
            return 's' + action.state;
        case 'reduce':
            return 'r' + action.state;
        case 'Error':
            return 'Error: ' + action.error;
        case 'conflict':
            let str = actionStr(action.actions[0]);
            for (let state = 1; state < action.actions.length; ++state) {
                str += ', ' + actionStr(action.actions[state]);
            }
            return str;
    }
};

//HTML Classes for various symbols  
const symbolClass = symbol => {
    if (symbol === 0) {
        return 'start-symbol';
    }
    if (symbol === symbols.length) {
        return 'end-marker';
    }
    if (isNonTerminal(symbol)) {
        return 'non-terminal';
    }
    if (isTerminal(symbol)) {
        return 'terminal';
    }
};
//---------------------------- X ------------------------------------------

//---------------------------- Functions to render on site ------------------------------------------
//To render arrows
const arrowNode = () =>{
   let node  = document.createElement("span");
   node.appendChild(document.createTextNode(' \u2192 '));
   node.classList.add("unicode");
   return node;
};

//To render dot in LR(0) Items
const bulletNode = () => {
    let node  = document.createElement("span");
    node.appendChild(document.createTextNode('\u2022'));
    node.classList.add("unicode");
    return node;
};

const element = (tag, content, classes, attrs) => {
    let node = document.createElement(tag);
    let contentItems;
    if (content === undefined) {
        contentItems = [];
    } else if (Array.isArray(content)) {
        contentItems = content;
    } else {
        contentItems = [content];
    }
    contentItems.forEach(contentItem => {
        if (typeof contentItem === 'object') {
            node.appendChild(contentItem);
        } else {
            node.appendChild(document.createTextNode(contentItem));
        }
    });
    if (classes !== undefined) {
        if (Array.isArray(classes)) {
            node.classList.add(...classes);
        } else {
            node.classList.add(classes);
        }
    }
    if (attrs !== undefined) {
        Object.keys(attrs).forEach(key => {
            node[key] = attrs[key];
        });
    }
    return node;
};

const symbolNode = (symbol, additionalClass) => {
    let classes = [symbolClass(symbol)];
    if (additionalClass !== undefined) {
        classes.push(additionalClass);
    }
    return element('strong', symbols[symbol], classes);
};

const symbolsNodes = symbols => (
    symbols.map(symbol => (
        symbolNode(symbol)
    ))
);

const ruleNodes = rule => [
    symbolNode(rule.lhs),
    arrowNode(),
    ...symbolsNodes(rule.rhs)
];

const itemNodes = item => {
    let nodes = [
        symbolNode(item.rule.lhs),
        arrowNode()
    ];
    item.rule.rhs.forEach((rhsSymbol, i) => {
        if (item.dot === i) {
            nodes.push(bulletNode());
        }
        nodes.push(symbolNode(rhsSymbol));
    });
    if (item.dot === item.rule.rhs.length) {
        nodes.push(bulletNode());
    }
    return nodes;
};

//Add item to rendered parse tree  
const addNode = (ulNode, node)=>{
    if(ulNode===undefined || node===undefined){
      return;
    }
    let liNode = document.createElement('li');
    liNode.classList.add(symbolClass(node.symbol));
    if(node.children.length===0){
      let spanNode = document.createElement('span');
      spanNode.classList.add("non-caret");
      spanNode.appendChild(document.createTextNode(symbols[node.symbol]));
      liNode.appendChild(spanNode);
    }else{
      let spanNode = document.createElement('span');
      spanNode.classList.add("caret");
      spanNode.appendChild(document.createTextNode(symbols[node.symbol]));
      spanNode.addEventListener("click", function() {
        this.parentElement.querySelector(".nested").classList.toggle("active");
        this.classList.toggle("caret-down");
      });  
      liNode.appendChild(spanNode);
      let childUl = document.createElement('ul');
      childUl.classList.add("nested");
      for(let i=0;i<node.children.length;i++){
        addNode(childUl,node.children[i]);
      }
      liNode.appendChild(childUl);  
    }
    ulNode.appendChild(liNode); 
};

const renderGrammar = container => {
    container.innerHTML = '';
    if (symbols === undefined) {
        return;
    }
    let preNode = document.createElement('pre');
    grammarRules.forEach((rule, i) => {
        preNode.appendChild(element('i', i + ' '));
        ruleNodes(rule).forEach(ruleNode => {
            preNode.appendChild(ruleNode);
        });
        if (i !== symbols.length - 1) {
            preNode.appendChild(document.createElement('br'));
        }
    });
    container.appendChild(preNode);
};

const renderCollection = container => {
    container.innerHTML = '';
    if (collection === undefined) {
        return;
    }
    let preNode = document.createElement('pre');
    collection.forEach((set, setIndex) => {
        set.forEach((item, itemIndex) => {
            preNode.appendChild(element('i',
                itemIndex === 0 ?
                    ['I', element('sub', setIndex), ' '] :
                    undefined
            ));
            itemNodes(item).forEach(itemNode => {
                preNode.appendChild(itemNode);
            });
            if (itemIndex !== set.length - 1) {
                preNode.appendChild(document.createElement('br'));
               
            }
        });
        if (setIndex !== collection.length - 1) {
            preNode.appendChild(document.createElement('br'));
            preNode.appendChild(document.createElement('br'));
            
        }
    });
    container.appendChild(preNode);
};

const renderParseTable = container => {
    container.innerHTML = '';
    if (parseTable === undefined) {
        return;
    }
    let tableNode = document.createElement('table');
    let theadNode = document.createElement('thead');
    tableNode.appendChild(theadNode);
    let theadTr1Node = document.createElement('tr');
    theadNode.appendChild(theadTr1Node);
    let theadTr2Node = document.createElement('tr');
    theadNode.appendChild(theadTr2Node);
    let tbodyNode = document.createElement('tbody');
    tableNode.appendChild(tbodyNode);
    theadTr1Node.appendChild(element('th', 'State', undefined, { rowSpan: 2 }));
    theadTr1Node.appendChild(element('th', 'Action', undefined, { colSpan: symbols.length - countVariables }));
    theadTr1Node.appendChild(element('th', 'Goto', undefined, { colSpan: countVariables - 1 }));
    for (let s = countVariables; s < symbols.length; ++s) {
        let classes = ['action'];
        if (s === symbols.length) {
            classes.push('end-marker');
        }
        theadTr2Node.appendChild(element('th', symbols[s], classes));
    }
    for (let s = 1; s < countVariables; ++s) {
        theadTr2Node.appendChild(element('th', symbols[s], 'goto'));
    }
    for (let i = 0; i < parseTable.length; ++i) {
        let trNode = document.createElement('tr');
        tbodyNode.appendChild(trNode);
        trNode.appendChild(element('td', i));
        for (let s = countVariables; s < symbols.length; ++s) {
            if (parseTable[i][s] === undefined) {
                trNode.appendChild(element('td', undefined, 'error'));
            } else {
                trNode.appendChild(element('td', actionStr(parseTable[i][s]), parseTable[i][s].type));
            }
        }
        for (let s = 1; s < countVariables; ++s) {
            trNode.appendChild(element('td', parseTable[i][s]));
        }
    }
    container.appendChild(tableNode);
};

const renderParseSteps = container => {
    container.innerHTML = '';
    if (trace === undefined) {
        return;
    }
    let tableNode = document.createElement('table');
    let theadNode = document.createElement('thead');
    tableNode.appendChild(theadNode);
    let theadTrNode = document.createElement('tr');
    theadNode.appendChild(theadTrNode);
    let tbodyNode = document.createElement('tbody');
    tableNode.appendChild(tbodyNode);
    theadTrNode.appendChild(element('th', 'Stack'));
    theadTrNode.appendChild(element('th', 'Input'));
    theadTrNode.appendChild(element('th', 'Action'));
    theadTrNode.appendChild(element('th', 'Rule'));
    trace.forEach(step => {
        let trNode = document.createElement('tr');
        tbodyNode.appendChild(trNode);
        let stackNode = document.createElement("td");
        for(let i=0;i<step.stack.length;i++){
            if(i&1){
                stackNode.appendChild(symbolNode(step.stack[i]));
            }else{
                let spanNode = document.createElement("span");
                spanNode.appendChild(document.createTextNode(step.stack[i]));
                stackNode.appendChild(spanNode);
            }
        }
       
        trNode.appendChild(stackNode);
        trNode.appendChild(element('td', symbolsNodes(step.input)));
        trNode.appendChild(element('td', actionStr(step.action), step.action.type));
        trNode.appendChild(element('td',
            step.action.type === 'reduce' ?
                ruleNodes(grammarRules[step.action.state]) :
                undefined
        ));
    });
    container.appendChild(tableNode);
};

const renderParseTree = container => {
    container.innerHTML = '';
    if (trace === undefined) {
        return;
    }
    let ulNode =document.createElement("ul");
    ulNode.id = "root";
    addNode(ulNode,getParseTree());
    if (ulNode !== undefined) {
        container.appendChild(ulNode);
    }
};

//---------------------------- Function for clearing data ------------------------------------------
const clear = () => {
    grammarRules = [];
    symbols  = [];
    countVariables = 0;
    collection = [];
    parseTable =  undefined;
    parseTableHasConflict = false;
    followStack = [];
    firstStack = [];
    trace = [];
};

const clearParsing = ()=>{
     trace = [];
};
//---------------------------- X ------------------------------------------

//---------------------------- Functions for sample inputs ------------------------------------------
const sampleGrammar = () => {
    return "E E + T\n" + "E T\n" + "T T * F\n" + "T F\n" + "F ( E )\n" + "F id";
};


const sampleInput = () => {
    return "id * id + id";
};
//---------------------------- X ------------------------------------------