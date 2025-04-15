
      const { ethers } = require("hardhat");
      
      async function main() {
        try {
          // Get signers
          const signers = await ethers.getSigners();
          console.log(`Available signers: ${signers.length}`);
          
          for (let i = 0; i < signers.length; i++) {
            console.log(`Signer ${i}: ${signers[i].address}`);
          }
          
          // Get the second verifier (account #2, index 2)
          const secondVerifier = signers[2];
          console.log(`Using second verifier: ${secondVerifier.address}`);
          
          // Get the first verifier (account #0, index 0, default signer)
          const admin = signers[0];
          console.log(`Admin address: ${admin.address}`);
          
          // Get contract addresses
          const addressesFile = require("../deployed-addresses.json");
          const identityAddr = addressesFile.DigitalIdentityNFT || 
                           addressesFile.digitalIdentityNFT || 
                           addressesFile.DIGITAL_IDENTITY_NFT;
          
          console.log(`Identity contract address: ${identityAddr}`);
          
          if (!identityAddr) {
            console.error("Identity contract address not found");
            process.exit(1);
          }
          
          // Connect to identity contract
          const DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
          const identityContract = await DigitalIdentityNFT.attach(identityAddr);
          
          // Check if second verifier has VERIFIER_ROLE
          const verifierRole = await identityContract.VERIFIER_ROLE();
          console.log(`VERIFIER_ROLE: ${verifierRole}`);
          
          const hasRole = await identityContract.hasRole(verifierRole, secondVerifier.address);
          console.log(`Second verifier has VERIFIER_ROLE: ${hasRole}`);
          
          if (!hasRole) {
            console.log("Granting VERIFIER_ROLE to second verifier...");
            const grantTx = await identityContract.connect(admin).grantRole(verifierRole, secondVerifier.address);
            await grantTx.wait();
            console.log("Role granted successfully");
            
            // Verify role was granted
            const hasRoleAfter = await identityContract.hasRole(verifierRole, secondVerifier.address);
            console.log(`Second verifier has VERIFIER_ROLE after granting: ${hasRoleAfter}`);
            
            if (!hasRoleAfter) {
              console.error("Failed to grant VERIFIER_ROLE to second verifier");
              process.exit(1);
            }
          }
          
          // Check current verification status
          const beforeDetails = await identityContract.getIdentityDetails(1);
          console.log(`Token ID: ${beforeDetails.tokenId}`);
          console.log(`Owner: ${beforeDetails.owner}`);
          console.log(`Verification level before: ${beforeDetails.verificationLevel}`);
          console.log(`Verification count before: ${await identityContract.verificationCount(1)}`);
          
          // Approve verification as second verifier
          console.log("Approving verification as second verifier...");
          const tx = await identityContract.connect(secondVerifier).approveVerification(
            1,
            2
          );
          
          console.log(`Transaction hash: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
          console.log("Verification approved by second verifier");
          
          // Get verification level after approval
          const afterDetails = await identityContract.getIdentityDetails(1);
          console.log(`Verification level after: ${afterDetails.verificationLevel}`);
          console.log(`Verification count after: ${await identityContract.verificationCount(1)}`);
          
          if (afterDetails.verificationLevel >= 2) {
            console.log("SUCCESS: Verification level updated successfully");
          } else {
            console.log("PARTIAL: Approval went through but verification level did not increase");
            console.log("This may be due to not having enough different verifiers");
          }
          
          // Return success indicator
          process.exit(0);
        } catch (error) {
          console.error("ERROR:", error.message);
          process.exit(1);
        }
      }
      
      main()
        .then(() => process.exit(0))
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
      