#!/usr/bin/env npm run

"""
Quick test script to verify Kaggle integration setup
Run: node test_kaggle.js
"""

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

const tests = [
  {
    name: '✅ Server Check',
    method: 'GET',
    endpoint: '/',
    expect: 200
  },
  {
    name: '✅ Get Products',
    method: 'GET',
    endpoint: '/api/products',
    expect: 200
  },
  {
    name: '📥 Fetch Kaggle Data',
    method: 'POST',
    endpoint: '/api/kaggle/fetch-data',
    expect: 200
  },
  {
    name: '📤 Import Kaggle Products',
    method: 'POST',
    endpoint: '/api/kaggle/import-products',
    dependency: 'fetch'
  },
  {
    name: '📊 View Stats',
    method: 'GET',
    endpoint: '/api/kaggle/stats',
    expect: 200
  }
];

async function runTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  🧪 Kaggle Integration Test Suite         ║');
  console.log('╚════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      console.log(`\nRunning: ${test.name}`);
      console.log(`  ${test.method} ${test.endpoint}`);

      const url = `${BASE_URL}${test.endpoint}`;
      const response = await fetch(url, {
        method: test.method,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ Status: ${response.status}`);
        console.log(`  ✅ Response: ${JSON.stringify(data).substring(0, 80)}...`);
        passed++;
      } else {
        console.log(`  ❌ Status: ${response.status}`);
        console.log(`  ❌ Error: ${data.error || data.message}`);
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n╔════════════════════════════════════════════╗');
  console.log(`║  Passed: ${passed}/${tests.length}                            ║`);
  console.log(`║  Failed: ${failed}/${tests.length}                            ║`);
  console.log('╚════════════════════════════════════════════╝\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! Kaggle integration is ready.');
  } else {
    console.log('⚠️  Some tests failed. Check the setup guide.');
  }
}

runTests();
