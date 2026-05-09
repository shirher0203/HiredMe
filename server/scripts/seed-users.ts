import "dotenv/config";
import mongoose from "mongoose";
import { hashPassword } from "../src/utils/auth";
import { UserModel } from "../src/models/user.model";

const MONGODB_URI = process.env.MONGODB_URI;

interface UserSeed {
  email: string;
  password: string;
  profile: {
    skills: string[];
    experienceYears: number;
    projects: string[];
    education: string;
    goals: string;
  };
  profileAnalysis: {
    seniorityEstimate: "junior" | "mid" | "senior";
    strengths: string[];
    weaknesses: string[];
    suggestedRoles: string[];
    summary: string;
  };
}

const seedUsers: UserSeed[] = [
  {
    email: "dev.frontend@example.com",
    password: "Password123!",
    profile: {
      skills: [
        "React",
        "TypeScript",
        "JavaScript",
        "CSS",
        "HTML",
        "Redux",
        "REST APIs",
      ],
      experienceYears: 4,
      projects: [
        "E-commerce Dashboard",
        "Social Media App",
        "Real-time Chat Application",
      ],
      education: "BS in Computer Science",
      goals: "Become a full-stack developer with expertise in modern web frameworks",
    },
    profileAnalysis: {
      seniorityEstimate: "mid",
      strengths: [
        "Strong frontend skills",
        "Good with component architecture",
        "Responsive design expertise",
      ],
      weaknesses: [
        "Limited backend experience",
        "Database design unfamiliar",
      ],
      suggestedRoles: ["Frontend Engineer", "Full-Stack Developer", "UI Engineer"],
      summary:
        "Experienced mid-level frontend developer with strong React and TypeScript skills, ready to expand into full-stack development.",
    },
  },
  {
    email: "dev.backend@example.com",
    password: "Password123!",
    profile: {
      skills: [
        "Node.js",
        "TypeScript",
        "MongoDB",
        "PostgreSQL",
        "Express",
        "RESTful APIs",
        "GraphQL",
        "Docker",
      ],
      experienceYears: 5,
      projects: [
        "Microservices Architecture",
        "Payment Gateway Integration",
        "Real-time Notification System",
      ],
      education: "BS in Software Engineering",
      goals: "Specialize in distributed systems and cloud architecture",
    },
    profileAnalysis: {
      seniorityEstimate: "mid",
      strengths: [
        "Solid backend fundamentals",
        "Database design experience",
        "API design skills",
      ],
      weaknesses: [
        "Limited DevOps knowledge",
        "Frontend skills minimal",
      ],
      suggestedRoles: ["Backend Engineer", "Full-Stack Developer", "Senior Backend Developer"],
      summary:
        "Competent mid-level backend developer with strong database and API design skills, interested in cloud and distributed systems.",
    },
  },
  {
    email: "devops.engineer@example.com",
    password: "Password123!",
    profile: {
      skills: [
        "Docker",
        "Kubernetes",
        "CI/CD",
        "AWS",
        "Jenkins",
        "Terraform",
        "Linux",
        "Shell Scripting",
        "Monitoring & Logging",
      ],
      experienceYears: 6,
      projects: [
        "Kubernetes Cluster Setup",
        "CI/CD Pipeline Automation",
        "Infrastructure as Code Migration",
        "Multi-region AWS Deployment",
      ],
      education: "BS in Information Technology",
      goals: "Lead DevOps transformation and implement cloud-native solutions",
    },
    profileAnalysis: {
      seniorityEstimate: "senior",
      strengths: [
        "Deep infrastructure expertise",
        "Automation skills",
        "Cloud platform proficiency",
      ],
      weaknesses: [
        "Limited application development experience",
      ],
      suggestedRoles: ["DevOps Engineer", "Cloud Architect", "Infrastructure Lead"],
      summary:
        "Senior DevOps engineer with extensive experience in containerization, orchestration, and cloud infrastructure automation.",
    },
  },
  {
    email: "cyber.security@example.com",
    password: "Password123!",
    profile: {
      skills: [
        "Network Security",
        "Penetration Testing",
        "OWASP Top 10",
        "SSL/TLS",
        "Cryptography",
        "Firewalls",
        "SIEM Tools",
        "Security Audit",
        "Incident Response",
      ],
      experienceYears: 7,
      projects: [
        "Security Audit of Enterprise App",
        "Vulnerability Assessment Program",
        "Incident Response Playbook Development",
        "Compliance Framework Implementation (ISO 27001)",
      ],
      education: "BS in Cybersecurity, Certified Ethical Hacker (CEH)",
      goals: "Become a Chief Information Security Officer and lead security strategy",
    },
    profileAnalysis: {
      seniorityEstimate: "senior",
      strengths: [
        "Comprehensive security knowledge",
        "Compliance expertise",
        "Strong problem-solving skills",
      ],
      weaknesses: [
        "Limited software development background",
      ],
      suggestedRoles: ["Security Engineer", "Penetration Tester", "Security Architect"],
      summary:
        "Senior cybersecurity professional with extensive experience in security audits, compliance, and incident response management.",
    },
  },
  {
    email: "qa.engineer@example.com",
    password: "Password123!",
    profile: {
      skills: [
        "Selenium",
        "Jest",
        "Cypress",
        "API Testing",
        "Test Automation",
        "Manual Testing",
        "LoadRunner",
        "Python",
        "SQL",
      ],
      experienceYears: 3,
      projects: [
        "Automated Test Suite for E-commerce",
        "Performance Testing Framework",
        "Mobile App Testing Strategy",
        "Regression Test Automation",
      ],
      education: "BS in Computer Science, ISTQB Certified",
      goals: "Develop expertise in test automation and lead QA strategy for products",
    },
    profileAnalysis: {
      seniorityEstimate: "mid",
      strengths: [
        "Strong test automation skills",
        "Good attention to detail",
        "API testing knowledge",
      ],
      weaknesses: [
        "Limited performance testing experience",
        "Development skills basic",
      ],
      suggestedRoles: ["QA Engineer", "Test Automation Engineer", "Quality Lead"],
      summary:
        "Capable mid-level QA engineer with solid test automation expertise and growing knowledge of performance and API testing.",
    },
  },
];

async function seedDatabase() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI not defined");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    // Clear existing users (optional - comment out if you want to keep existing data)
    console.log("Clearing existing users...");
    await UserModel.deleteMany({});

    console.log("Seeding users...");
    for (const seedUser of seedUsers) {
      const passwordHash = await hashPassword(seedUser.password);

      const user = new UserModel({
        email: seedUser.email,
        passwordHash,
        profile: seedUser.profile,
        profileAnalysis: seedUser.profileAnalysis,
      });

      await user.save();
      console.log(`✓ Created user: ${seedUser.email}`);
    }

    console.log("\n✅ Seeding completed successfully!");
    console.log(`Total users created: ${seedUsers.length}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedDatabase();
