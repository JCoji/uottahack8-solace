import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());

const data = {
  score: 86,
  softSkillFeedback: [
    "Could improve mentoring documentation, such as written onboarding guides or reusable knowledge base articles",
    "Limited public speaking examples; no evidence of conference talks, workshops, or large-group presentations",
    "Collaboration impact is mentioned but lacks concrete examples of cross-team coordination",
    "Feedback delivery style is unclear (no examples of code reviews, peer feedback, or coaching)",
    "Leadership activities are implied but not explicitly demonstrated with outcomes"
  ],
  hardSkillFeedback: [
    "Missing Kubernetes expertise; no experience with cluster management, deployments, or Helm charts",
    "No Rust experience mentioned, which is listed as a preferred language for performance-critical components",
    "Limited GraphQL background; no schema design, resolver implementation, or API performance optimization examples",
    "No evidence of CI/CD pipeline ownership (e.g., GitHub Actions, GitLab CI, Jenkins)",
    "Infrastructure-as-code tools (Terraform, CloudFormation) are not referenced",
    "Monitoring and observability experience is unclear (no mention of Prometheus, Grafana, or logging stacks)",
    "Cloud platform usage is mentioned at a high level but lacks specifics (services used, scale, or architecture)"
  ]
};

app.get('/', (req, res) => {
  res.json({ message: 'Backend running! Visit /api/analyze for test data' });
});

app.get('/api/analyze', (req, res) => {
  res.json(analysisData);
});

app.listen(3000, () => console.log('✅ Backend running on http://localhost:3000'));


// to start server:
// cd backend
// npm install
// npm run dev