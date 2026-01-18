pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        // Reset form to default state on page load
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('jobForm');
            form.reset();
            document.getElementById('fileNameDisplay').textContent = '';
            document.getElementById('resumeText').value = '';
            document.getElementById('noDataState').classList.remove('hidden');
            document.getElementById('loadingState').classList.add('hidden');
            document.getElementById('dataDisplayState').classList.add('hidden');
            document.getElementById('scoreBar').style.width = '0%'; // Reset bar
        });

        const resumeInput = document.getElementById('resume');
        const resumeText = document.getElementById('resumeText');
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        const submitBtn = document.getElementById('submitBtn');

        let isExtracting = false;

        // Function to fetch data from FastAPI SAM connection
        async function fetchAnalysisData() {
            const company = document.getElementById('company').value;
            const jobDescription = document.getElementById('jobDescription').value;
            const resumeText = document.getElementById('resumeText').value;
            
            const payload = {
                resume: resumeText,
                companyName: company,
                jobDesc: jobDescription
            };
            
            try {
                console.log('%c[Fetching Analysis Data from SAM]', 'color: #2563eb; font-weight: bold;');
                console.log('%c[Payload]', 'color: #f59e0b; font-weight: bold;', payload);
                
                // NOTE: This fetch assumes your backend is running at this address
                const response = await fetch('http://localhost:8081/api/v1/fit-score', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                console.log('%c[API Response Data]', 'color: #10b981; font-weight: bold;', data);
                return data;
            } catch (error) {
                console.error('%c[API Error]', 'color: #ef4444; font-weight: bold;', error);
                throw error;
            }
        }

        // New function to convert form data into JSON
async function createFormDataJSON() {
    const company = document.getElementById('company').value;
    const jobDescription = document.getElementById('jobDescription').value;
    const resumeText = document.getElementById('resumeText').value;
    
    const formDataJSON = {
        company: company,
        jobDescription: jobDescription,
        resumeText: resumeText,
    };
    
    console.log('%c[Form Data JSON]', 'color: #f59e0b; font-weight: bold;', formDataJSON);
    return JSON.stringify(formDataJSON);
}

        resumeInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) {
                fileNameDisplay.textContent = '';
                return;
            }

            fileNameDisplay.textContent = file.name;
            fileNameDisplay.classList.remove('text-red-500');
            
            isExtracting = true;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Reading PDF...';

            const reader = new FileReader();
            reader.onload = async function(event) {
                try {
                    const typedarray = new Uint8Array(event.target.result);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }

                    resumeText.value = fullText.trim();
                    console.log('%c[Resume Extracted]', 'color: #3b82f6; font-weight: bold;', 'Chars:', fullText.length);
                } catch (error) {
                    console.error('Error extracting PDF text:', error);
                    fileNameDisplay.textContent = 'Error reading PDF.';
                    fileNameDisplay.classList.add('text-red-500');
                } finally {
                    isExtracting = false;
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-2"></i> Analyze Match';
                }
            };
            reader.readAsArrayBuffer(file);
        });

        document.getElementById('jobForm').addEventListener('submit', function(e) {
            e.preventDefault();
            
            if (isExtracting) return;

            const company = document.getElementById('company').value;
    const jobDescription = document.getElementById('jobDescription').value;
    const extractedResumeText = document.getElementById('resumeText').value;

    console.group('%c[Form Submission]', 'color: #2563eb; font-weight: bold;');
    console.log('Company:', company);
    console.log('JD length:', jobDescription.length);
    console.log('Resume length:', extractedResumeText.length);
    console.groupEnd();

            const btn = document.getElementById('submitBtn');
            const originalContent = btn.innerHTML;
            
            // Update Button State
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Processing...';
            btn.disabled = true;

            // Update Right Panel State (Show Loading)
            document.getElementById('noDataState').classList.add('hidden');
            document.getElementById('dataDisplayState').classList.add('hidden');
            document.getElementById('loadingState').classList.remove('hidden');

            fetchAnalysisData().then(data => {
                // Success: Hide Loading, Show Data
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('dataDisplayState').classList.remove('hidden');

                // Update text score
                const scoreValue = data.score;
                document.getElementById('scoreResult').textContent = scoreValue;

                // Update Progress Bar
                // We parse the score to ensure it's a number for the CSS width
                const percentage = parseFloat(scoreValue) || 0;
                // Clamp between 0 and 100
                const finalPercent = Math.min(100, Math.max(0, percentage));
                
                // Small timeout to ensure the DOM is visible before animating
                setTimeout(() => {
                    document.getElementById('scoreBar').style.width = `${finalPercent}%`;
                }, 100);

                document.getElementById('softResult').innerHTML = (data.softSkillFeedback || []).map(item => `<li>${item}</li>`).join('');
                document.getElementById('hardResult').innerHTML = (data.techSkillFeedback || []).map(item => `<li>${item}</li>`).join('');
                
                btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Results Loaded';
                setTimeout(() => {
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                }, 2000);

            }).catch(error => {
                console.error('Error fetching analysis data:', error);
                
                // Error: Hide Loading, Show Error on Button
                document.getElementById('loadingState').classList.add('hidden');
                document.getElementById('noDataState').classList.remove('hidden');
                
                btn.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i> Error';
                setTimeout(() => {
                    btn.innerHTML = originalContent;
                    btn.disabled = false;
                }, 3000);
            });
        });