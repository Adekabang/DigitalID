/**
 * Script to copy contract ABIs from artifacts to the oracle/abis directory
 */
const fs = require('fs');
const path = require('path');

// Paths
const artifactsDir = path.join(__dirname, '../../artifacts/contracts');
const abisDir = path.join(__dirname, '../abis');

// Create abis directory if it doesn't exist
if (!fs.existsSync(abisDir)) {
  fs.mkdirSync(abisDir, { recursive: true });
}

// Contracts to copy
const contracts = [
  'DigitalIdentityNFT',
  'VerificationRegistry',
  'ModeratorControl',
  'ReputationSystem',
  'AppealSystem',
  'MultiFactorAuth'
];

// Copy ABIs
let successCount = 0;
for (const contract of contracts) {
  const artifactPath = path.join(artifactsDir, `${contract}.sol/${contract}.json`);
  const outputPath = path.join(abisDir, `${contract}.json`);
  
  try {
    if (fs.existsSync(artifactPath)) {
      // Read artifact JSON
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      
      // Write ABI to output file
      fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
      
      console.log(`✅ Copied ABI for ${contract}`);
      successCount++;
    } else {
      console.warn(`⚠️ Artifact not found for ${contract}: ${artifactPath}`);
    }
  } catch (error) {
    console.error(`❌ Error copying ABI for ${contract}:`, error);
  }
}

console.log(`\nCopied ${successCount}/${contracts.length} ABIs to ${abisDir}`);