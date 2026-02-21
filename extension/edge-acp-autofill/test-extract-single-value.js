/**
 * Test extractSingleValue function for "EXACTLY ONE OF:" pattern handling
 * Run in browser console on the Initial Assessment form page
 */

// Extract single value helper (from content-initial-assessment.js)
const extractSingleValue = (val) => {
  if (!val || typeof val !== 'string') return val;
  // Strip any "EXACTLY ONE OF:" prefix the AI might echo back
  return val.replace(/^EXACTLY ONE OF:\s*/i, '').trim();
};

// Test cases
const testCases = [
  {
    input: "EXACTLY ONE OF: Good",
    expected: "Good",
    description: "Should extract single value with prefix"
  },
  {
    input: "Good",
    expected: "Good",
    description: "Should handle value without prefix"
  },
  {
    input: "EXACTLY ONE OF: Yes / No",
    expected: "Yes / No",
    description: "Should strip prefix but keep the value"
  },
  {
    input: "Independent",
    expected: "Independent",
    description: "Should pass through clean values"
  },
  {
    input: "exactly one of: Fair",
    expected: "Fair",
    description: "Should be case-insensitive"
  },
  {
    input: "",
    expected: "",
    description: "Should handle empty string"
  },
  {
    input: null,
    expected: null,
    description: "Should handle null"
  },
  {
    input: "  EXACTLY ONE OF:  Fit for Purpose  ",
    expected: "Fit for Purpose",
    description: "Should trim whitespace"
  }
];

// Run tests
console.group("🧪 extractSingleValue Test Suite");
let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = extractSingleValue(test.input);
  const success = result === test.expected;
  
  if (success) {
    passed++;
    console.log(`✅ Test ${index + 1}: ${test.description}`);
  } else {
    failed++;
    console.error(`❌ Test ${index + 1}: ${test.description}`);
    console.error(`  Input: "${test.input}"`);
    console.error(`  Expected: "${test.expected}"`);
    console.error(`  Got: "${result}"`);
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.groupEnd();

// Real-world mapping test
console.group("🌍 Real-World Mapping Test");

const testData = {
  riskSection1Health: {
    speech: "EXACTLY ONE OF: Good",
    hearing: "Fair",
    eyesight: "EXACTLY ONE OF: Very Poor",
    memory: "Good",
    understandsInfo: "Yes"
  },
  riskSection5Mobility: {
    walking: "EXACTLY ONE OF: Independent",
    stairs: "Requires Assistance",
    canBeLeftAlone: "EXACTLY ONE OF: Always"
  },
  riskSection6Appliances: {
    cooker: "EXACTLY ONE OF: Fit for Purpose",
    kettle: "Fit for Purpose"
  }
};

const mapped = {
  speech: extractSingleValue(testData.riskSection1Health.speech),
  hearing: extractSingleValue(testData.riskSection1Health.hearing),
  eyesight: extractSingleValue(testData.riskSection1Health.eyesight),
  memory: extractSingleValue(testData.riskSection1Health.memory),
  understandsInfo: extractSingleValue(testData.riskSection1Health.understandsInfo),
  walking: extractSingleValue(testData.riskSection5Mobility.walking),
  stairs: extractSingleValue(testData.riskSection5Mobility.stairs),
  canBeLeftAlone: extractSingleValue(testData.riskSection5Mobility.canBeLeftAlone),
  cooker: extractSingleValue(testData.riskSection6Appliances.cooker),
  kettle: extractSingleValue(testData.riskSection6Appliances.kettle)
};

console.log("Mapped values:");
console.table(mapped);

const expectedValues = {
  speech: "Good",
  hearing: "Fair",
  eyesight: "Very Poor",
  memory: "Good",
  understandsInfo: "Yes",
  walking: "Independent",
  stairs: "Requires Assistance",
  canBeLeftAlone: "Always",
  cooker: "Fit for Purpose",
  kettle: "Fit for Purpose"
};

let mappingPassed = 0;
let mappingFailed = 0;

Object.keys(expectedValues).forEach(key => {
  if (mapped[key] === expectedValues[key]) {
    mappingPassed++;
  } else {
    mappingFailed++;
    console.error(`❌ Mapping error for ${key}: expected "${expectedValues[key]}", got "${mapped[key]}"`);
  }
});

console.log(`\n📊 Mapping Results: ${mappingPassed} passed, ${mappingFailed} failed out of ${Object.keys(expectedValues).length} fields`);
console.groupEnd();

// Export for manual inspection
window.testExtractSingleValue = {
  extractSingleValue,
  testCases,
  testData,
  mapped,
  expectedValues
};

console.log("\n✨ Test complete! Function available as window.testExtractSingleValue");
