# Curio

## 1. Proposal, Thesis, and Vision

### 1.1 Proposal

Build **Curio**, a platform that allows a student to upload a textbook, syllabus, lecture slides, assignments, notes, and other course materials, then automatically converts those materials into a fully interactive, personalized learning website.

The resulting experience should not resemble a conventional PDF viewer with a chatbot attached. It should behave like a dynamic course environment that understands the structure of the subject, the requirements of the course, and the evolving knowledge state of the learner.

The platform should transform static educational material into:

- An interactive textbook
- A personalized course map
- A persistent AI tutor
- A practice and assessment environment
- A misconception detection system
- A long-term mastery and retention engine

The central product experience is simple:

> **Curio: Upload the course. Master the material.**

The system ingests the source material, reconstructs its intellectual structure, identifies concepts and prerequisites, generates interactive learning experiences, and continuously adapts to the student.

### 1.2 Core Thesis

Textbooks contain knowledge, but they do not contain a functioning learning system.

A conventional textbook cannot:

- Determine what the learner already understands
- Identify the exact reason a learner is confused
- Detect missing prerequisites
- Change the representation of an explanation
- Generate targeted practice
- Observe the learner's reasoning process
- Reduce support as the learner improves
- Schedule review based on likely forgetting
- Evaluate whether knowledge transfers to unfamiliar problems

The product thesis is that the value of AI in education is not primarily its ability to explain content on demand. Its greatest value is its ability to create and manage a continuous adaptive learning loop.

That loop consists of:

1. Observing the learner
2. Estimating the learner's knowledge state
3. Selecting the next best learning action
4. Delivering the right representation or activity
5. Evaluating the learner's response
6. Updating the learner model
7. Revisiting the concept at the appropriate time

The uploaded textbook is therefore not merely a document to be searched. It becomes the source material from which an adaptive course is compiled.

### 1.3 Product Thesis

The platform is best understood as a runtime for educational content.

The core system consists of five layers:

1. **Content compiler**  
   Converts textbooks and course materials into structured educational objects.

2. **Knowledge graph**  
   Represents concepts, definitions, equations, examples, prerequisites, and relationships.

3. **Learner model**  
   Tracks mastery, misconceptions, prerequisite gaps, confidence, retention, and dependence on assistance.

4. **Pedagogical action engine**  
   Decides whether the student should receive an explanation, question, example, simulation, hint, review task, or assessment.

5. **Interactive learning interface**  
   Presents the material as a living course rather than a passive document.

The product is not simply an AI tutor and not simply an interactive textbook. It is the integration of source-grounded course material, structured learner state, and adaptive instructional decision-making.

### 1.4 Vision

The long-term vision is to make any sufficiently structured body of knowledge immediately teachable.

A student should be able to upload a textbook and receive a course that feels intentionally designed around them. The platform should know:

- What the source says
- What the course requires
- What the student understands
- What the student misunderstands
- Which prerequisite is blocking progress
- Which representation is most likely to help
- When the student is ready for independent work
- When a concept is likely to be forgotten
- Whether the learner can transfer knowledge to a new setting

The experience should feel less like reading a digitized textbook and more like having an expert tutor, course designer, teaching assistant, and learning scientist working together.

The ideal end state is a universal learning environment in which static educational content becomes adaptive, interactive, and measurable.

### 1.5 Product Principles

#### Book first, tutor everywhere

The primary interface should remain anchored in the course material. The tutor should be available within the reading experience rather than forcing the student into a separate chat interface.

#### Interaction should emerge from the content

Students should be able to select any definition, equation, graph, figure, paragraph, table, or exercise and immediately interact with it.

#### The system should optimize for independence

The product should not maximize session length or message volume. It should maximize durable learning and reduce dependence on the tutor over time.

#### Understanding must be demonstrated

The system should not rely on the learner saying that an explanation makes sense. It should require prediction, explanation, application, transfer, or retrieval.

#### Source and inference must remain distinct

The platform should visibly separate:

- Content directly supported by the uploaded source
- Tutor-generated explanations
- External enrichment
- Generated examples
- Inferences made by the system

#### Productive friction is a feature

The system should resist becoming an automatic homework-completion machine. It should encourage attempts, reasoning, and gradual hints before revealing complete answers.

#### Personalization should be explainable

Whenever the system recommends a topic or activity, it should tell the student why.

Example:

> This topic is being recommended because it is a prerequisite for Chapter 7 and you missed two related diagnostic questions.

### 1.6 Initial Market Position

The strongest initial product wedge is likely college-level quantitative learning, especially:

- Economics
- Econometrics
- Statistics
- Calculus
- Linear algebra
- Physics
- Introductory programming

These subjects are attractive because they contain:

- Clear conceptual dependencies
- Equations and graphs that benefit from interaction
- Problems with partially verifiable answers
- Frequent opportunities for practice
- Common and diagnosable misconceptions
- High student demand for tutoring
- Strong potential for interactive simulations

A particularly strong initial positioning would be:

> Turn your economics, statistics, or calculus textbook into a personalized interactive course and exam tutor.

### 1.7 Long-Term Business Direction

The product can begin as a consumer study tool, but the broader opportunity is a platform used by instructors, institutions, and publishers.

A plausible progression is:

1. Consumer product for students
2. Instructor course-conversion platform
3. Institutional learning infrastructure
4. Publisher licensing and interactive textbook tooling
5. API and learning runtime for external education platforms

The consumer product provides product velocity and direct feedback. Instructor adoption improves course alignment and distribution. Publisher partnerships provide licensing scale and defensibility.

---

## 2. High- to Mid-Level Product and Technical Implementation Strategy

### 2.1 System Overview

The platform should be designed as a pipeline with several major stages:

1. Content ingestion
2. Document parsing and reconstruction
3. Educational object extraction
4. Knowledge graph construction
5. Course alignment
6. Learner diagnosis
7. Interactive content generation
8. Tutoring and activity selection
9. Assessment and learner-model updates
10. Retention scheduling and long-term adaptation

A simplified architecture is:

```text
Uploaded Materials
        ↓
Document Parsing and OCR
        ↓
Structured Educational Objects
        ↓
Knowledge Graph and Course Map
        ↓
Learner Diagnostic and Profile
        ↓
Pedagogical Action Engine
        ↓
Interactive Reader, Tutor, Practice, and Review
        ↓
Learner Performance Signals
        ↓
Updated Learner Model
```

### 2.2 Content Ingestion

#### Supported inputs

The platform should accept:

- PDF textbooks
- EPUB files
- Course syllabi
- Lecture slides
- Assignments
- Problem sets
- Past exams
- Instructor notes
- Student notes
- Optional lecture transcripts

#### Upload workflow

The user should be able to create a course workspace and upload multiple files. The system should classify each file by likely role:

- Primary textbook
- Supplementary reading
- Syllabus
- Lecture material
- Assignment
- Assessment
- Notes

The user should be able to correct classifications when needed.

#### Initial processing result

After processing, the platform should summarize what it found:

- Number of chapters and sections
- Number of major concepts
- Definitions
- Equations
- Figures and tables
- Worked examples
- Exercises
- Course coverage based on the syllabus
- Estimated processing confidence
- Parsing issues that may require user review

This gives the user immediate confidence that the system understood the material.

### 2.3 Document Parsing and Reconstruction

Textbook parsing is one of the hardest technical components and should be treated as a core product capability.

#### Challenges

Educational documents frequently contain:

- Multiple columns
- Headers and footers
- Footnotes
- Equations
- Figure captions
- Cross-references
- Sidebars
- Tables
- Scanned pages
- Broken OCR
- Exercises that span multiple pages
- Answer keys separated from questions
- Inconsistent section numbering

#### Recommended approach

Use a layered parsing pipeline rather than relying on a single extraction method.

##### Layer 1: Native text extraction

For digitally generated PDFs and EPUB files:

- Extract text blocks
- Preserve reading order
- Preserve page references
- Detect headings and section hierarchy
- Capture font and layout metadata

##### Layer 2: Layout analysis

Use document-layout models to identify:

- Main text
- Headers
- Footnotes
- Equations
- Captions
- Tables
- Figures
- Sidebars
- Exercises

##### Layer 3: OCR fallback

Use OCR only where native extraction fails or pages are scanned.

##### Layer 4: Semantic reconstruction

Use language models and rule-based validators to reconstruct:

- Chapter hierarchy
- Section boundaries
- Equation references
- Figure references
- Example boundaries
- Exercise-answer relationships
- Cross-chapter links

##### Layer 5: Quality validation

Run automated checks for:

- Missing pages
- Duplicate text
- Broken equations
- Incorrect reading order
- Missing captions
- Suspicious OCR output
- Unmatched exercise references

The system should expose low-confidence regions to the user or an internal review process.

### 2.4 Educational Object Model

The system should not store the textbook only as chunks of text. It should convert content into typed educational objects.

Core object types include:

- Chapter
- Section
- Concept
- Definition
- Theorem
- Assumption
- Equation
- Variable
- Figure
- Graph
- Table
- Historical event
- Process
- Example
- Counterexample
- Worked problem
- Exercise
- Solution
- Learning objective
- Misconception candidate
- Prerequisite relationship
- Assessment item

Each object should include:

- Source location
- Page number
- Section identifier
- Original content reference
- Semantic summary
- Related concepts
- Confidence score
- Permissions for display and transformation

This object model becomes the foundation for interaction generation.

### 2.5 Knowledge Graph Construction

The knowledge graph should represent the intellectual structure of the course.

#### Node types

Nodes may include:

- Concepts
- Definitions
- Theorems
- Equations
- Skills
- Procedures
- Examples
- Misconceptions
- Learning objectives

#### Edge types

Edges may represent:

- Prerequisite of
- Depends on
- Contrasts with
- Example of
- Derived from
- Used in
- Commonly confused with
- Generalization of
- Special case of
- Assessed by

#### Construction strategy

Use a hybrid approach:

- Structural information from the document
- Language-model extraction
- Domain-specific heuristics
- Embedding similarity
- Equation and symbol linkage
- Cross-reference analysis
- Optional instructor correction

The graph should initially be treated as probabilistic. Every relationship should have a confidence score and supporting evidence.

#### User-facing value

The graph powers:

- Course maps
- Prerequisite diagnosis
- Personalized learning order
- Cross-chapter explanations
- Review scheduling
- Root-cause analysis of mistakes

Example:

> Your difficulty with constrained optimization appears to originate in partial derivatives rather than the Lagrangian itself.

### 2.6 Course and Syllabus Alignment

The syllabus should determine which parts of the textbook matter.

The system should extract:

- Assigned chapters
- Excluded sections
- Course schedule
- Exam dates
- Assignment deadlines
- Instructor emphasis
- Learning objectives
- Grading weights

It should then create a course-specific overlay on top of the textbook.

The platform should distinguish:

- Core assigned material
- Supplementary material
- Unassigned textbook content
- High-probability assessment material
- Prerequisite material that may need review

Past exams, slides, and assignments can be used to estimate instructor emphasis, while clearly labeling the result as an inference.

### 2.7 Learner Onboarding and Diagnostic

The onboarding experience should establish both learner intent and initial skill level.

#### Goal capture

Ask for:

- Course or self-study objective
- Target date
- Desired grade or mastery level
- Available study time
- Prior exposure
- Preferred explanation style

Preferences should guide the initial experience, but the system should later adapt based on observed performance rather than relying solely on self-report.

#### Adaptive diagnostic

The diagnostic should estimate:

- Factual familiarity
- Conceptual understanding
- Procedural fluency
- Mathematical prerequisites
- Ability to transfer knowledge
- Confidence calibration

The diagnostic should be short, adaptive, and targeted toward high-value concepts.

#### Output

The learner should receive:

- Initial course map
- Strengths
- Weak areas
- Missing prerequisites
- Estimated study plan
- Recommended starting point

### 2.8 Learner Model

The learner model is one of the central technical and product assets.

It should track more than correct and incorrect answers.

#### Core learner-state dimensions

For each concept or skill, track:

- Exposure
- Recognition
- Recall
- Conceptual understanding
- Procedural skill
- Independent performance
- Transfer performance
- Confidence
- Retention estimate
- Assistance dependence
- Misconceptions
- Last practice time

#### Misconception model

The system should maintain structured misconception records.

Example:

```text
Concept: Statistical significance
Misconception: Believes larger coefficients necessarily have lower p-values
Evidence: Two incorrect explanations and one failed classification task
Confidence: High
Recommended intervention: Contrast coefficient magnitude with uncertainty
Retest schedule: Tomorrow and five days later
```

#### Modeling approach

An initial implementation can combine:

- Bayesian knowledge tracing
- Item response theory
- Heuristic mastery thresholds
- Confidence-weighted performance
- Recency and forgetting curves
- Model-generated misconception classifications

The system should remain interpretable. Product decisions should not depend entirely on opaque latent representations.

### 2.9 Pedagogical Action Engine

The pedagogical action engine determines the next best learning action.

Possible actions include:

- Explain
- Ask a diagnostic question
- Provide an analogy
- Show a worked example
- Request a prediction
- Launch a simulation
- Give a hint
- Reduce scaffolding
- Review a prerequisite
- Assign retrieval practice
- Test transfer
- Ask the student to teach the concept back

#### Decision inputs

The engine should consider:

- Current learner state
- Course importance
- Concept prerequisites
- Time until assessment
- Recent errors
- Confidence calibration
- Hint dependence
- Estimated forgetting
- User-selected mode
- Current reading context

#### Initial implementation

Do not begin with a fully autonomous reinforcement-learning system.

Start with a transparent rule-based policy informed by learning science and learner-state estimates. Add learned ranking models later when sufficient outcome data exists.

Example policy:

```text
If prerequisite mastery is low:
    assign prerequisite review
Else if learner is confidently wrong:
    use misconception contrast activity
Else if learner is correct only with hints:
    assign faded-scaffolding practice
Else if learner has recent independent success:
    test transfer or schedule delayed retrieval
```

### 2.10 Hyper Tutor Interaction Modes

The tutor should have explicit pedagogical modes rather than a single generic chat behavior.

#### Teach mode

- Diagnoses the source of confusion
- Chooses an appropriate explanation
- Uses examples and representations
- Ends with a demonstration of understanding

#### Socratic mode

- Asks one targeted question at a time
- Focuses on the learner's exact misconception
- Avoids vague prompts

#### Coach mode

- Reviews the learner's work step by step
- Finds the earliest meaningful error
- Gives the smallest useful hint
- Gradually escalates support

#### Examiner mode

- Hides hints
- Uses time constraints where appropriate
- Awards partial credit
- Probes reasoning
- Mixes concepts

#### Debate mode

- Argues competing positions
- Requires evidence and precision
- Can switch sides
- Evaluates the strength of the learner's reasoning

#### Office-hours mode

- Accepts incomplete and informal questions
- Helps the learner locate the real source of confusion
- Links explanations back to the source material

#### Teach-it-back mode

- Requires the learner to explain
- Asks clarifying questions
- Identifies omissions and inconsistencies
- Tests whether the learner can communicate the concept independently

### 2.11 Interactive Reader UX

The primary interface should resemble an intelligent textbook.

#### Desktop layout

##### Left rail

- Course map
- Chapter hierarchy
- Mastery status
- Upcoming review
- Bookmarks
- Notes
- Assessment deadlines

##### Main content area

- Original source excerpts where permitted
- Figures
- Equations
- Interactive annotations
- Embedded questions
- Simulations
- Worked examples
- Student notes

##### Tutor rail

Context-sensitive actions such as:

- Explain this
- Show visually
- Derive this
- Give an example
- Give a counterexample
- Connect this to another concept
- Quiz me
- Let me try
- Challenge the author
- What might appear on the exam?

#### Mobile design

On mobile, use a single-column reader with:

- Persistent selection actions
- Bottom-sheet tutor
- Compact progress indicators
- Swipeable practice cards
- Audio explanation option

### 2.12 Object-Specific Interactions

Different content types should produce different interactions.

#### Definitions

- Plain-language version
- Technical version
- Example
- Counterexample
- Classification task
- Comparison with related terms

#### Equations

- Symbol explanation
- Derivation
- Unit or dimensional check
- Interactive sliders
- Graph updates
- Numerical example
- Assumption inspection
- Limiting cases

#### Graphs

- Hover labels
- Animated construction
- Parameter controls
- Predict-then-reveal tasks
- Graph-to-verbal translation
- Verbal-to-graph translation

#### Worked examples

- Hide the next step
- Ask the learner to choose an operation
- Detect the first incorrect step
- Generate a similar problem
- Adjust scaffolding
- Compare solution methods

#### Paragraphs and arguments

- Argument map
- Premise and conclusion extraction
- Simplification
- Socratic questioning
- Counterargument generation
- Connection to other sections

#### Processes

- Animation
- Labeling task
- Prediction
- Manipulable simulation
- Troubleshooting scenario

### 2.13 Interactive Content Generation

Generating an entire interactive site upfront may be too costly and may produce unnecessary content.

Use a tiered generation strategy.

#### Tier 1: Precompute globally

- Document structure
- Concept map
- Definitions
- Equations
- Source references
- Basic summaries
- Exercise index

#### Tier 2: Precompute selectively

For high-priority concepts:

- Common misconceptions
- Canonical examples
- Basic interactive graphs
- Diagnostic questions
- Exam-relevant practice

#### Tier 3: Generate on demand

- Personalized explanations
- New practice problems
- Analogies
- Tutor conversations
- Detailed simulations
- Remediation lessons

#### Caching

Cache reusable generated assets by:

- Textbook edition
- Chapter
- Concept
- Difficulty level
- Interaction type

Do not regenerate identical educational objects for every user.

### 2.14 Assessment Engine

Assessment should test multiple forms of understanding.

#### Assessment types

- Recognition
- Recall
- Explanation
- Application
- Transfer
- Error diagnosis
- Synthesis
- Creation

#### Item generation

Each generated question should include:

- Concept target
- Difficulty
- Expected reasoning path
- Correct answer
- Common wrong answers
- Misconception mapping
- Source grounding
- Validation status

#### Validation

Quantitative items should use programmatic verification where possible:

- Symbolic math checking
- Numerical solvers
- Unit tests
- Code execution
- Constraint checks
- Multiple independent solution methods

High-stakes or instructor-facing items should require stronger validation than casual practice items.

### 2.15 Homework and Productive Friction

The system should distinguish between learning and task completion.

Possible user modes:

- Learn it
- Check my work
- Complete it

The default educational workflow should use a hint ladder:

1. Ask the learner to identify the relevant concept
2. Request an attempt
3. Diagnose the attempt
4. Give a conceptual hint
5. Give a procedural hint
6. Show an analogous example
7. Reveal the solution only after meaningful effort or an explicit mode change

The platform can also track an assistance profile:

- Independent attempts
- Hints used
- Full solution reveals
- Accuracy after support is withdrawn

This should be presented as feedback rather than punishment.

### 2.16 Reading Modes and Attention Management

The platform should not interrupt the learner constantly.

Offer three reading modes.

#### Flow mode

- Minimal interruption
- Optional definitions
- Tutor remains quiet
- End-of-section checkpoint

#### Guided mode

- Occasional embedded questions
- Predictions
- Short explanations
- Mini simulations

#### Intensive mode

- Frequent prerequisite checks
- Teach-back activities
- Worked examples
- Retrieval tasks

The system may recommend a mode based on difficulty and learner history, but the learner should remain in control.

### 2.17 Retention and Review

The system should automatically schedule review based on:

- Concept importance
- Learner mastery
- Time since last successful retrieval
- Confidence
- Error history
- Upcoming assessments
- Predicted forgetting

Review activities should include:

- Free recall
- Graph reconstruction
- One-step problems
- Error diagnosis
- Concept comparison
- Example generation
- Short oral explanation

The goal is to make spaced practice part of the course experience rather than a separate flashcard workflow.

### 2.18 Source Grounding and Provenance

Every meaningful claim should be traceable.

The interface should label content as:

- From the textbook
- From course materials
- Tutor-generated explanation
- Tutor-generated example
- External enrichment
- System inference

The user should be able to open the relevant source location directly.

The system should preserve:

- Page numbers
- Section references
- Figure identifiers
- Equation numbers
- File names

This is essential for trust, academic use, and instructor adoption.

### 2.19 Hallucination and Quality Control

The platform must assume that generated explanations, exercises, and derivations can be wrong.

#### Controls

- Require citations for source claims
- Mark unsupported inferences
- Use confidence estimates
- Run mathematical verification
- Compare generated answers against textbook solutions
- Use multiple-model checking for difficult content
- Detect inconsistencies across generated assets
- Allow user reporting and correction
- Maintain version history

#### Escalation

For low-confidence content, the system should say so explicitly.

Example:

> The textbook's notation is ambiguous in this section. This explanation is an interpretation rather than a direct restatement.

### 2.20 Copyright and Content Rights

The product should be designed conservatively around uploaded copyrighted material.

#### Product safeguards

- Require users to confirm lawful access
- Keep uploaded materials private by default
- Do not create public textbook copies
- Limit unnecessary verbatim reproduction
- Link generated explanations back to source excerpts
- Keep user content separate from model training by default
- Provide deletion controls
- Encrypt stored files
- Restrict employee access
- Support publisher licensing
- Prioritize open textbooks and instructor-owned material early

The platform should treat the uploaded material as private source content used to generate personalized educational interactions, not as content to redistribute.

### 2.21 Privacy and Student Data

The learner model may contain sensitive educational data.

The platform should support:

- Data minimization
- Clear consent
- Private learner profiles
- User-controlled deletion
- Exportable progress records
- Separate institutional and personal accounts
- Aggregated instructor analytics
- Role-based access
- Audit logs

Instructor dashboards should emphasize cohort-level learning patterns and avoid unnecessary surveillance.

### 2.22 Instructor Product

The instructor version can create stronger distribution and revenue.

Instructor capabilities should include:

- Upload course materials
- Generate an interactive course site
- Edit the concept map
- Approve or reject generated content
- Create assignments
- View aggregate misconception patterns
- Review weak concepts
- Generate targeted review sessions
- Create oral follow-up questions
- Set tutoring policies
- Control which materials students can access

The instructor should remain the course authority. AI-generated material should be editable and reviewable.

### 2.23 Cost and Infrastructure Strategy

The platform may face significant inference and media-generation costs.

#### Cost controls

- Process the book once and reuse structured output
- Cache common explanations and activities
- Generate expensive assets only when requested
- Use smaller models for classification and extraction
- Use larger models only for complex tutoring and reasoning
- Batch offline processing
- Deduplicate repeated requests
- Use retrieval instead of repeatedly sending full chapters
- Store structured summaries at multiple levels

#### Model routing

Use different models for:

- OCR cleanup
- Classification
- Concept extraction
- Question generation
- Tutoring
- Mathematical reasoning
- Safety and quality review

A model router should choose the least expensive model that can reliably perform each task.

### 2.24 Recommended Technical Stack

A possible early stack:

#### Front end

- React or Next.js
- Responsive reader interface
- Rich text and equation rendering
- WebGL or charting libraries for simulations
- Local autosave for notes

#### Back end

- Python or TypeScript services
- FastAPI or comparable API framework
- PostgreSQL for users, courses, and learner state
- Object storage for uploaded files and generated assets
- Vector database for retrieval
- Graph database or graph tables for concept relationships
- Queue system for document processing

#### AI and processing

- Document-layout parsing service
- OCR fallback
- Embedding service
- Language-model orchestration
- Symbolic math engine
- Sandboxed code execution
- Evaluation and tracing system

#### Observability

Track:

- Parsing confidence
- Tutor latency
- Generation cost
- Citation coverage
- Item validity
- Learner outcomes
- Hint dependence
- Error reports

### 2.25 MVP Scope

The first version should be narrow and exceptional.

#### Recommended MVP

Support:

- One textbook per course
- Optional syllabus
- PDF input
- Chapter and concept extraction
- Course map
- Highlight-to-tutor
- Definition and equation interactions
- Adaptive diagnostic
- Guided worked examples
- Practice generation
- Misconception tracking
- Basic mastery map
- Review queue
- Exam-preparation mode

#### Avoid initially

- Open social community
- K-12 compliance complexity
- Parent dashboards
- Full learning-management-system replacement
- Avatar teachers
- Automatic video generation
- Broad public sharing
- Every academic subject
- Fully autonomous grading

### 2.26 Best Initial Demonstration

The strongest demo should focus on one difficult chapter and show the complete learning loop.

Example:

An econometrics student uploads a chapter on instrumental variables.

The platform:

1. Builds a dependency map
2. Diagnoses confusion about exogeneity
3. Explains the exclusion restriction visually
4. Animates weak and strong first stages
5. Shows the two-stage process algebraically
6. Generates a simulated dataset
7. Lets the student estimate the model
8. Asks the student to identify valid and invalid instruments
9. Detects a misconception
10. Schedules a transfer question for the next day

This demonstrates the platform as a coherent system rather than a collection of AI features.

### 2.27 Core Product Metrics

Avoid optimizing primarily for time in app.

The north-star metric should approximate:

> Durable independent mastery achieved per hour of study.

Supporting metrics:

- Delayed retrieval performance
- Transfer performance
- Reduction in hint dependence
- Confidence calibration
- Time to independent correct solution
- Mastery gains per study hour
- Completion of high-priority concepts
- Exam performance relative to diagnostic prediction
- Retention after one week or one month

### 2.28 Defensibility

The defensible assets are not basic chat or retrieval.

The strongest potential moats are:

- High-quality textbook and course parsing
- Educational object extraction
- Accurate knowledge graphs
- Persistent learner-state models
- Misconception libraries
- Pedagogical action-selection policies
- Verified interactive learning objects
- Outcome data connecting activity selection to durable learning
- Instructor and publisher workflows
- Course-specific integrations and distribution

### 2.29 Product Roadmap

#### Phase 1: Interactive course conversion

- Upload textbook and syllabus
- Build course map
- Contextual tutor
- Interactive definitions, equations, and examples
- Basic diagnostics and practice

#### Phase 2: Adaptive mastery system

- Persistent learner model
- Misconception tracking
- Spaced review
- Transfer assessment
- Exam planning

#### Phase 3: Instructor platform

- Course publishing
- Content approval
- Cohort analytics
- Assignment creation
- Tutoring policy controls

#### Phase 4: Publisher and institutional infrastructure

- Licensed textbook catalogs
- Shared interactive assets
- LMS integrations
- Organization-level analytics
- API access

#### Phase 5: General learning runtime

- Support for broader subjects
- External content providers
- Developer tools
- Third-party learning applications
- Cross-course learner profiles

---

## Conclusion

The platform should not be built as a document-chat product. It should be built as an adaptive learning system that uses textbooks and course materials as structured source inputs.

The central technical challenge is not generating explanations. It is reconstructing the educational structure of the source, maintaining an accurate model of the learner, and selecting the next best instructional action.

The winning experience is one in which the student feels that the entire course has been rebuilt around their needs, while remaining grounded in the assigned material and oriented toward independent mastery.
