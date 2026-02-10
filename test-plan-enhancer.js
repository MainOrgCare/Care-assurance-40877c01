import fs from 'fs';
import FormData from 'form-data';

async function testPlanEnhancer() {
  console.log('🚀 Testing Plan Enhancer with Joseph Williamson documents...\n');

  // Read the PDF files
  const pdf1Path = '/workspaces/Care-assurance-40877c01/attached_assets/202601281346MrJosephKennethWilliamsonMrJosephKennethWilliamson (2).pdf';
  const pdf2Path = '/workspaces/Care-assurance-40877c01/attached_assets/Fast Track forml 2023 Joseph williamson (1) (1) (2).pdf';

  const pdf1 = fs.readFileSync(pdf1Path);
  const pdf2 = fs.readFileSync(pdf2Path);

  console.log(`📄 Document 1: ${pdf1.length} bytes`);
  console.log(`📄 Document 2: ${pdf2.length} bytes\n`);

  // Create form data
  const formData = new FormData();
  formData.append('supportingDocuments', pdf1, 'joseph-williamson-1.pdf');
  formData.append('supportingDocuments', pdf2, 'joseph-williamson-fast-track.pdf');

  console.log('⏳ Sending request to Plan Enhancer API...\n');

  try {
    const response = await fetch('http://localhost:5000/api/ai/enhance-plan', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error:', response.status, errorText);
      return;
    }

    console.log('✅ Response received. Processing SSE stream...\n');

    const text = await response.text();
    const lines = text.split('\n');
    
    let progress = 0;
    let result = null;

    for (const line of lines) {
      if (line.startsWith('event: progress')) {
        const nextLine = lines[lines.indexOf(line) + 1];
        if (nextLine && nextLine.startsWith('data: ')) {
          const data = JSON.parse(nextLine.substring(6));
          if (data.percent > progress) {
            progress = data.percent;
            console.log(`📊 Progress: ${data.percent}% - ${data.status}`);
          }
        }
      } else if (line.startsWith('event: result')) {
        const nextLine = lines[lines.indexOf(line) + 1];
        if (nextLine && nextLine.startsWith('data: ')) {
          result = JSON.parse(nextLine.substring(6));
        }
      } else if (line.startsWith('event: error')) {
        const nextLine = lines[lines.indexOf(line) + 1];
        if (nextLine && nextLine.startsWith('data: ')) {
          const error = JSON.parse(nextLine.substring(6));
          console.error('❌ Error:', error.message);
          return;
        }
      }
    }

    if (result) {
      console.log('\n' + '='.repeat(80));
      console.log('📋 GENERATED CARE PLAN');
      console.log('='.repeat(80) + '\n');

      console.log(`Service User: ${result.serviceUserName || 'N/A'}`);
      console.log(`Date: ${result.planDate || 'N/A'}\n`);

      if (result.sections && result.sections.length > 0) {
        result.sections.forEach((section, i) => {
          console.log(`\n${'─'.repeat(80)}`);
          console.log(`SECTION ${i + 1}: ${section.heading}`);
          console.log('─'.repeat(80));
          console.log(section.content);
        });
      }

      console.log('\n' + '='.repeat(80));
      console.log(`✅ Care plan generated successfully!`);
      console.log(`   Sections: ${result.sections?.length || 0}`);
      console.log(`   Total content: ${JSON.stringify(result).length} characters`);
      console.log('='.repeat(80) + '\n');

      // Save to file
      const outputPath = '/workspaces/Care-assurance-40877c01/test-output-care-plan.json';
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`💾 Full output saved to: ${outputPath}\n`);
    } else {
      console.log('⚠️  No result received from API');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testPlanEnhancer().catch(console.error);
