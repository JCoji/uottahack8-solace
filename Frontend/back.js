
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
//test
// Reset form to default state on page load
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('jobForm');
    form.reset();
    document.getElementById('fileNameDisplay').textContent = '';
    document.getElementById('resumeText').value = '';
    document.getElementById('noDataState').classList.remove('hidden');
    document.getElementById('dataDisplayState').classList.add('hidden');
});

const resumeInput = document.getElementById('resume');
const resumeText = document.getElementById('resumeText');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const submitBtn = document.getElementById('submitBtn');

let isExtracting = false;

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
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Processing...';
    btn.disabled = true;

    setTimeout(() => {
        document.getElementById('noDataState').classList.add('hidden');
        document.getElementById('dataDisplayState').classList.remove('hidden');

        document.getElementById('previewCompany').textContent = company;
        document.getElementById('comparisonDetails').textContent = jobDescription.length > 250 
            ? jobDescription.substring(0, 250) + '...' 
            : jobDescription;

        // Ensure text is set and visible
        const previewEl = document.getElementById('comparisonSummary');
        previewEl.textContent = extractedResumeText || "No text could be extracted.";
        
        btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Results Loaded';
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }, 2000);
    }, 600);
});
