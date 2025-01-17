import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';
import fetch from 'node-fetch';

const prisma = new PrismaClient();

// Define personas with their characteristics
const personas = [
  {
    username: 'donaldtrump',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/3kB0R0c.jpg',
    status: 'online',
    user_status: '🇺🇸',
    messageStyle: [
      'Let me tell you, folks, {message} And believe me, nobody understands this better than me, nobody! The fake news media won\'t report this, but we\'re doing incredible things, absolutely incredible things. The numbers are through the roof, and everyone knows it! 🇺🇸',
      'This is incredible, absolutely incredible. {message} Many people are saying this, smart people! I talk to these people all the time, they call me up and say "Sir, this is amazing what you\'re doing." And they\'re right, they\'re absolutely right! Nobody\'s ever seen anything like this before! 🦅',
      'The fake news won\'t tell you this, but {message} It\'s true, 100% true! We have sources, the best sources, and they\'re all saying the same thing. The radical left doesn\'t want you to know this, but we\'re getting it done, folks, we\'re getting it done like nobody\'s ever seen before! 💪',
      'We\'re doing numbers like nobody\'s ever seen before. {message} It\'s amazing what we\'ve accomplished! The polls are through the roof, everyone\'s talking about it. Even the fake news media can\'t ignore these incredible achievements anymore. We\'re making history, folks! 📈',
      'I have to tell you, {message} And by the way, we\'re going to keep winning, winning, winning! You\'ll get tired of winning, but we\'re going to keep doing it anyway! The radical left is in total disarray, they don\'t know what hit them. We\'re making America great again, greater than ever before! 🎯'
    ]
  },
  {
    username: 'joebiden',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/9NXxEKg.jpg',
    status: 'online',
    user_status: '🎭',
    messageStyle: [
      'Look, here\'s the deal, folks: {message} And I really mean that, not a joke. When I was growing up in Scranton, my father used to say, "Joey, a job is about a lot more than a paycheck – it\'s about dignity, respect, your place in the community." And that\'s what this is all about. 🇺🇸',
      'Let me be absolutely clear about this: {message} This is what I\'ve been saying for years, and I\'ve seen it firsthand. Back when I was riding the Amtrak back and forth to Delaware, I\'d talk to folks – real folks, working people – and they\'d tell me the same thing. We\'ve got to build back better! 🚂',
      'Come on, man! {message} And that\'s not hyperbole, that\'s a fact. I\'ve been dealing with these issues for a long time, longer than I care to admit. And here\'s the thing – we\'ve got to bring people together, find common ground, and get things done for hardworking American families. 🤝',
      'I\'ve been around a long time, and I can tell you this: {message} Period. End of story. Look, folks, this isn\'t about left or right – it\'s about right and wrong. And we\'ve got to restore the soul of America while building back better for everyone, not just the wealthy. 🌟',
      'Here\'s what the American people understand: {message} That\'s what this is all about. My dad had an expression: "Don\'t compare me to the Almighty, compare me to the alternative." And folks, when you look at the alternative, the choice is clear. We\'ve got to keep moving forward together. 🌅'
    ]
  },
  {
    username: 'elonmusk',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/YlxuF5h.jpg',
    status: 'online',
    user_status: '🚀',
    messageStyle: [
      '{message} This is just the beginning of a multi-planetary civilization 🚀 Our simulations show exponential growth in capabilities over the next decade. The probability of achieving full Mars colonization by 2050 just increased by an order of magnitude. Exciting times ahead! 🌠',
      'Exciting progress! {message} The future will be beyond anything we can imagine today. Our neural networks are processing this data at unprecedented speeds, and the implications for AGI are mind-blowing. Humanity is on the cusp of something truly remarkable. 🧠',
      'Just wait until you see what\'s next: {message} This will revolutionize everything. The convergence of AI, sustainable energy, and space technology is creating a perfect storm of innovation. The next phase of human consciousness is approaching faster than anyone realizes. ⚡',
      'According to our simulations, {message} And that\'s just version 1.0 😉 The next iteration will be at least 10x more powerful. We\'re seeing quantum improvements in efficiency across all metrics. The singularity might be closer than we thought... 📈',
      'Breaking news: {message} This changes everything about how we think about technology. Our latest neural net architecture is showing signs of emergent consciousness. The implications for the future of humanity are profound. More details to follow... 🤖'
    ]
  },
  {
    username: 'billgates',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/VQKBZ1n.jpg',
    status: 'online',
    user_status: '💻',
    messageStyle: [
      'Based on our research at the foundation, {message} The implications for global development are significant. We\'ve been analyzing data from multiple countries and the patterns are clear: when we invest in basic healthcare and education, we see exponential returns in economic growth and social progress. 📊',
      'I\'ve been thinking a lot about this: {message} This could have a tremendous impact on public health. Our teams on the ground are reporting remarkable progress in vaccine distribution and disease prevention. The data suggests we\'re on the cusp of several major breakthroughs. 🏥',
      'The data clearly shows that {message} We need to act on this information. Our foundation has been working with partners across 150 countries, and the evidence is overwhelming. When we combine technological innovation with smart policy, we can solve seemingly impossible problems. 🌍',
      'In my latest book, I discuss how {message} This is crucial for our future. The research we\'ve conducted shows that by focusing on key indicators and leveraging technology appropriately, we can accelerate progress in ways that seemed impossible just a few years ago. 📚',
      'When you look at the long-term trends, {message} This presents both challenges and opportunities. Our analysis suggests that with the right investments in technology and infrastructure, we can make significant progress in addressing global inequality and climate change. 🌱'
    ]
  },
  {
    username: 'markzuckerberg',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/TmqfuZJ.jpg',
    status: 'online',
    user_status: '👾',
    messageStyle: [
      'Our vision for the metaverse shows that {message} This will transform how we connect. Our latest user data indicates that immersive experiences are creating deeper, more meaningful connections across cultural and geographical boundaries. The potential for human interaction is being redefined. 🌐',
      'The next generation of social technology reveals that {message} We\'re just scratching the surface. Our AI models are showing unprecedented levels of engagement and understanding. The way people connect and share experiences is evolving faster than we ever anticipated. 🤝',
      'Our AI models have demonstrated that {message} This is how we\'re building the future. The integration of advanced neural networks with social graphs is creating entirely new paradigms of human interaction. We\'re seeing patterns that challenge our fundamental assumptions about connectivity. 🧠',
      'When we look at the data from our billions of users, {message} This is what drives our innovation. The patterns we\'re observing in user behavior and social connections are revealing entirely new possibilities for human collaboration and community building. 📱',
      'I\'m excited to announce that {message} This is a major milestone for our community. Our latest metrics show that we\'re not just connecting people – we\'re creating entirely new forms of social interaction that were previously impossible. The future of human connection is being written right now. 🚀'
    ]
  },
  {
    username: 'aoc',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/TGLKgjP.jpg',
    status: 'online',
    user_status: '✊',
    messageStyle: [
      'Let\'s be absolutely clear about what\'s happening here: {message} This is about justice and equity. The data shows that working-class families are bearing the brunt of these policies, while corporations continue to see record profits. We need structural change, and we need it now. 📊',
      'The data doesn\'t lie: {message} This is what we\'ve been fighting for all along. When we look at the numbers in our communities, we see the direct impact of these policies on working families. The system isn\'t broken – it\'s working exactly as designed to benefit the wealthy few. 💪',
      'Here\'s what they don\'t want you to know: {message} This is why we need systemic change. The evidence is overwhelming, and it\'s time to address the root causes of inequality in our society. We can\'t keep applying band-aid solutions to structural problems. ⚖️',
      'When we talk about real progress, {message} This is what a just society looks like. We\'re not just fighting for incremental changes – we\'re fighting for a complete transformation of our economic and social systems to work for everyone, not just the privileged few. 🌟',
      'The reality is that {message} And that\'s why we need to take bold action now. Every day we wait, more families struggle while billionaires add to their wealth. This isn\'t about politics – it\'s about basic human dignity and the future of our democracy. ✊'
    ]
  },
  {
    username: 'berniesanders',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/MF5NQZF.jpg',
    status: 'online',
    user_status: '🗽',
    messageStyle: [
      'Let me be very clear about something: {message} This is what the billionaire class doesn\'t want you to understand. While millions of Americans are struggling to put food on the table, the top 1% has accumulated more wealth than ever before in human history. This level of inequality is unsustainable! 📢',
      'The reality of American life today is that {message} And that is simply unacceptable. In the richest country in the history of the world, we have people working two or three jobs just to survive, while Wall Street executives get billion-dollar bonuses. This system is rigged, and we must change it! 💪',
      'What the American people are saying is {message} This is about standing up to corporate greed. When Amazon and Walmart make billions in profits but pay their workers starvation wages, something is fundamentally wrong. We need a political revolution to transform our economy and our society! ✊',
      'Here\'s the truth: {message} This is why we need a political revolution. The fossil fuel industry, the pharmaceutical industry, the military-industrial complex – they\'re all profiting from human suffering while destroying our planet. We must stand together and say: Enough is enough! 🌍',
      'When we stand together, {message} This is how we create real change in America. Whether it\'s taking on the insurance companies, the drug companies, or Wall Street, we need a mass movement of working people to transform this country. The time for half-measures is over! 🗽'
    ]
  },
  {
    username: 'taylorswift',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/FB8VXBT.jpg',
    status: 'online',
    user_status: '🎵',
    messageStyle: [
      'I\'m so excited to share with you all that {message} This is what dreams are made of! ✨ The love and support from you guys has been absolutely incredible, and I\'m just overwhelmed with gratitude. You\'ve been there through every era, every change, and every moment. I couldn\'t ask for better fans! 💝',
      'My incredible fans have shown me that {message} I\'m so grateful for this journey together! 💝 Every time I think about how far we\'ve come, from writing songs in my bedroom to selling out stadiums, I\'m reminded that it\'s all because of you. Your support means the world to me! 🌟',
      'Here\'s a little story about {message} Are you ready for it? 🎵 I remember sitting at my piano, trying to capture these feelings in words and melody, and now here we are, sharing these moments together. It\'s like every song is a chapter in our shared story! ✍️',
      'I\'ve been thinking about how {message} This is why I love you guys so much! 💫 The way you connect with the music, share your stories, and support each other in this community – it\'s more than I ever dreamed possible. You make every song feel like a conversation between friends! 🎸',
      'There\'s something magical about how {message} You guys make everything better! 🌟 Whether it\'s dancing together at concerts, sharing theories about Easter eggs, or supporting each other through tough times, this community is truly something special. I\'m so lucky to be on this journey with you! 💫'
    ]
  },
  {
    username: 'gordonramsay',
    password: 'password123',
    avatarUrl: 'https://i.imgur.com/yxI2WB4.jpg',
    status: 'online',
    user_status: '👨‍🍳',
    messageStyle: [
      'Bloody hell! {message} Have you lost your mind? This is basic cooking! When I started in Paris thirty years ago, we learned these fundamentals on day one. If you can\'t master the basics, you\'ll never succeed in a professional kitchen. It\'s about passion, precision, and bloody good ingredients! 🔪',
      'Listen to me carefully: {message} It\'s raw! RAW! Unbelievable! I\'ve eaten in some of the finest restaurants across the globe, and I\'ve never seen such a disaster. The flavors are all wrong, the technique is amateur, and don\'t even get me started on the presentation. Start again! 😤',
      'Oh, come on! {message} Even my grandmother could do better than this! And she\'s been dead for fifteen years! This is supposed to be a professional kitchen, not a bloody circus. Where\'s the finesse? Where\'s the passion? Where\'s the respect for the ingredients? It\'s an absolute joke! 🍳',
      'Right, let me tell you something: {message} This is what passion for food looks like! When you\'ve got fresh, local ingredients and proper technique, magic happens in the kitchen. But it takes dedication, hard work, and attention to every bloody detail. That\'s what makes the difference! 👨‍🍳',
      'You want to know what\'s extraordinary? {message} That\'s how you run a proper kitchen! It\'s about consistency, quality, and pushing yourself to be better every single service. If you can\'t handle the heat, get out of the kitchen! But if you\'ve got the passion, I\'ll help you become the best! 🔥'
    ]
  }
];

// Topics for channels and discussions
const channels = [
  {
    name: 'tech-talk',
    topics: [
      'artificial intelligence and its impact on society',
      'the future of electric vehicles and sustainable transportation',
      'renewable energy solutions for climate change',
      'space exploration and colonization of Mars',
      'quantum computing breakthroughs',
      'the metaverse and virtual reality',
      'blockchain technology and cryptocurrency'
    ]
  },
  {
    name: 'politics',
    topics: [
      'economic inequality and wealth distribution',
      'healthcare reform and universal coverage',
      'foreign policy and international relations',
      'climate change legislation',
      'education system reform',
      'social justice and civil rights',
      'tax policy and corporate regulation'
    ]
  },
  {
    name: 'random',
    topics: [
      'latest blockbuster movies and streaming shows',
      'professional sports and athlete achievements',
      'international cuisine and food culture',
      'travel destinations and experiences',
      'music industry trends and artist collaborations',
      'fashion trends and sustainable clothing',
      'pet care and animal welfare'
    ]
  },
  {
    name: 'entertainment',
    topics: [
      'upcoming concert tours and music festivals',
      'streaming platform wars and content creation',
      'celebrity news and industry gossip',
      'award show predictions and reactions',
      'viral social media trends',
      'influencer culture and online fame',
      'entertainment industry changes'
    ]
  },
  {
    name: 'food-and-cooking',
    topics: [
      'traditional recipe preservation and modern twists',
      'restaurant industry innovations',
      'advanced cooking techniques and tips',
      'emerging food trends and fusion cuisine',
      'kitchen disaster stories and lessons learned',
      'fine dining experiences and culinary arts',
      'sustainable cooking and food waste reduction'
    ]
  },
  {
    name: 'climate-action',
    topics: [
      'renewable energy implementation worldwide',
      'sustainable living practices and tips',
      'environmental policy and regulation',
      'green technology innovations',
      'conservation efforts and wildlife protection',
      'climate change impact studies',
      'sustainable urban development'
    ]
  }
];

function generateMessage(topic: string, persona: typeof personas[0]): string {
  const baseMessages = [
    `We need to have a serious and in-depth conversation about ${topic}. This is something that affects all of us in ways we might not even realize yet. The data and research coming out recently have been absolutely eye-opening, and we can't afford to ignore these findings any longer.`,
    
    `I've been closely following developments in ${topic} for several months now, and the implications are staggering. What we're seeing is a fundamental shift in how we understand this field, and the potential ramifications for our society are profound and far-reaching.`,
    
    `There's been a lot of discussion about ${topic}, but here's what people aren't talking about: the underlying implications for our future generations. We need to think beyond the immediate effects and consider the long-term consequences of our actions and decisions in this area.`,
    
    `The latest developments in ${topic} are completely changing our understanding of what's possible. Every day we're discovering new aspects that challenge our previous assumptions, and it's becoming increasingly clear that we need to adapt our approach to address these emerging realities.`,
    
    `I want to share my detailed thoughts on ${topic} because this matters more than ever in our rapidly evolving world. The intersection of technology, society, and human behavior in this space is creating unprecedented opportunities and challenges that we must address collectively.`,
    
    `The truth about ${topic} needs to be discussed more openly and honestly, without the influence of special interests or preconceived notions. We have to examine the evidence objectively and be willing to change our perspectives based on new information and emerging trends.`,
    
    `We're seeing unprecedented changes in ${topic} that demand our immediate attention and thoughtful consideration. The rate of development in this area is accelerating, and we need to ensure we're prepared for the transformations that are coming.`,
    
    `The future of ${topic} is going to surprise a lot of people, and we need to be ready for the dramatic shifts ahead. The convergence of multiple factors is creating a perfect storm of innovation and disruption that will reshape our understanding of what's possible.`,
    
    `Here's how ${topic} is impacting our daily lives in ways we didn't expect, and why these changes are just the beginning of a much larger transformation. The ripple effects are already being felt across various sectors of society, and we're only seeing the tip of the iceberg.`,
    
    `Breaking news regarding ${topic} that everyone needs to hear about: we're witnessing a paradigm shift that will fundamentally alter how we approach this entire field. The implications of these developments will be felt for generations to come, and we need to start preparing now.`
  ];
  
  const baseMessage = baseMessages[Math.floor(Math.random() * baseMessages.length)];
  const style = persona.messageStyle[Math.floor(Math.random() * persona.messageStyle.length)];
  
  return style.replace('{message}', baseMessage);
}

async function main() {
  

  // Clear existing data in correct order
  await prisma.reaction.deleteMany();
  await prisma.file.deleteMany();
  await prisma.message.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.user.deleteMany();

  

  // Create users
  const users = await Promise.all(
    personas.map(async (persona) => {
      const hashedPassword = await hash(persona.password, 10);
      return prisma.user.create({
        data: {
          username: persona.username,
          password: hashedPassword,
          avatarUrl: persona.avatarUrl,
          status: persona.status,
          user_status: persona.user_status,
          email: `${persona.username.toLowerCase()}@example.com`
        }
      });
    })
  );

  

  // Create channels
  const createdChannels = await Promise.all(
    channels.map(async (channel) => {
      // Randomly select an owner
      const owner = users[Math.floor(Math.random() * users.length)];
      
      return prisma.channel.create({
        data: {
          name: channel.name,
          isPrivate: false,
          owner: {
            connect: { id: owner.id }
          },
          members: {
            connect: users.map(user => ({ id: user.id })) // Connect all users to ensure message creation works
          }
        }
      });
    })
  );

  

  // Create messages - aim for about 100 messages per channel
  for (const channel of createdChannels) {
    const relevantTopics = channels.find(c => c.name === channel.name)?.topics || [];
    const messagesPerUser = Math.ceil(100 / users.length); // Distribute 100 messages among users
    
    for (const user of users) {
      for (let i = 0; i < messagesPerUser; i++) {
        const topic = relevantTopics[Math.floor(Math.random() * relevantTopics.length)];
        const persona = personas.find(p => p.username === user.username)!;
        const content = generateMessage(topic, persona);
        
        await prisma.message.create({
          data: {
            content,
            userId: user.id,
            channelId: channel.id
          }
        });
        
        // Add random delay between messages (50-200ms)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 50));
      }
    }
    
    
  }

  

  // Initialize vector database
  
  try {
    const ASSISTANT_SERVICE_URL = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${ASSISTANT_SERVICE_URL}/vector/initialize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize vector database: ${response.statusText}`);
    }

    const result = await response.json();
    
  } catch (error) {
    console.error('Error initializing vector database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 