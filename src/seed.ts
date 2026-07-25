import mongoose from 'mongoose';
import { User } from './models/User.js';
import { Hackathon } from './models/Hackathon.js';
import { Team } from './models/Team.js';
import { connectDB } from './lib/db.js';
import bcryptjs from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hackhub_dev';

async function seed() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  // Clear existing data
  console.log('Clearing old collections...');
  await User.deleteMany({});
  await Hackathon.deleteMany({});
  await Team.deleteMany({});

  console.log('Generating seed users...');

  // Helper to hash password
  const hashPassword = async (pwd: string) => {
    return await bcryptjs.hash(pwd, 10);
  };

  // 1. Super Admin
  const superAdmin = await User.create({
    name: 'Super Admin',
    email: 'admin@hackhub.com',
    password: 'password123',
    role: 'super_admin',
    isVerified: true,
  });

  // 2. College Admin
  const collegeAdmin = await User.create({
    name: 'Tech University Admin',
    email: 'college@university.edu',
    password: 'password123',
    role: 'college_admin',
    isVerified: true,
    profile: {
      collegeName: 'Tech University',
    }
  });

  // 3. Student
  const student = await User.create({
    name: 'Alex Johnson',
    email: 'student@example.com',
    password: 'password123',
    role: 'student',
    isVerified: true,
    profile: {
      skills: ['React', 'TypeScript', 'Node.js', 'MongoDB'],
      githubUrl: 'https://github.com/alexj',
      linkedinUrl: 'https://linkedin.com/in/alexj',
      collegeName: 'Tech University',
    }
  });

  // 4. Judge
  const judge = await User.create({
    name: 'Dr. Sarah Connor',
    email: 'judge@example.com',
    password: 'password123',
    role: 'judge',
    isVerified: true,
  });

  // 5. Mentor
  const mentor = await User.create({
    name: 'Marcus Aurelius',
    email: 'mentor@example.com',
    password: 'password123',
    role: 'mentor',
    isVerified: true,
  });

  // 6. Recruiter
  const recruiter = await User.create({
    name: 'Recruiter Jane',
    email: 'recruiter@startup.io',
    password: 'password123',
    role: 'recruiter',
    isVerified: true,
  });

  // 7. Company
  const company = await User.create({
    name: 'Cyberdyne Systems',
    email: 'sponsorship@cyberdyne.com',
    password: 'password123',
    role: 'company',
    isVerified: true,
  });

  // 8. Sponsor
  const sponsor = await User.create({
    name: 'Acme Corp',
    email: 'sponsor@acme.org',
    password: 'password123',
    role: 'sponsor',
    isVerified: true,
  });

  console.log('Seeded 8 user roles successfully.');

  // Create Hackathons
  console.log('Generating seed hackathons...');
  const hack1 = await Hackathon.create({
    title: 'Global Dev Sprint 2026',
    description: 'The largest online developer sprint to build solutions for climate change and educational accessibility.',
    organizerId: collegeAdmin._id,
    startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days out
    endDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    mode: 'online',
    maxTeamSize: 4,
    status: 'upcoming',
    themes: ['Climate Tech', 'EdTech', 'Social Good'],
    rules: 'No plagiarism. Submissions must be original.',
    judges: [judge._id],
    mentors: [mentor._id],
  });

  const hack2 = await Hackathon.create({
    title: 'University AI Hack 2026',
    description: 'Bring your AI tools, agents, and LLM integrations to life in a 48 hour localized university hackathon.',
    organizerId: collegeAdmin._id,
    startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Active now
    endDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    mode: 'in_person',
    maxTeamSize: 3,
    status: 'active',
    themes: ['AI/ML Agents', 'LLM Dev', 'Robotics'],
    rules: 'Must use open source AI toolkits.',
    judges: [judge._id],
    mentors: [mentor._id],
  });

  console.log('Seeded hackathons successfully.');

  console.log('Generating seed team...');
  await Team.create({
    name: 'AI Innovators',
    hackathonId: hack2._id,
    creatorId: student._id,
    members: [{ userId: student._id, role: 'leader' }],
  });
  console.log('Seeded student team.');

  console.log('Database seeding complete!');
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Error seeding database:', err);
  process.exit(1);
});
