/**
 * Portfolio project index for /portfolio.
 *
 * Source of truth: Projects.csv supplied for the WZRD.tech portfolio page —
 * every row where `:draft` is false, in CSV order. `url` is normalized to an
 * absolute URL when a scheme is missing; root-relative paths are preserved.
 * Categories are derived from the row's name/role/description text.
 */

export interface PortfolioProject {
  name: string;
  role: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string | null;
  categories: string[];
}

export const portfolioProjects: PortfolioProject[] = [
  {
    "name": "$JATT | GAIA Autonomous Hackathon IP Award",
    "role": "Cognitive Architect and Creative Director",
    "description": "THE WORLD'S FIRST ON-CHAIN GEN AI ARTIST BACKED BY A MEMECOIN",
    "url": "https://www.youtube.com/@jattdaputt888",
    "image": "https://framerusercontent.com/images/PDIdK3SqGELXImzcMXCHxVDiEkY.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music",
      "AI & Agents",
      "Web3"
    ]
  },
  {
    "name": "DUNIYA",
    "role": "Executive Producer x Filmmaker",
    "description": "THE TAPE (DELUXE EDITION) MUSIC VIDEO for DUNIYA",
    "url": "https://www.youtube.com/watch?v=Q0H5P25WsKw&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/JX2yIMHxjHXarrwZobe42DItam8.png",
    "imageAlt": null,
    "categories": [
      "Film & Music"
    ]
  },
  {
    "name": "iJSK!",
    "role": "Executive Producer x Filmmaker",
    "description": "THE TAPE (DELUXE EDITION) MUSIC VIDEO",
    "url": "https://www.youtube.com/watch?v=wBnrlsYqPug&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/OWrWMPenXk6C476xiF1ua7Fh48.png",
    "imageAlt": null,
    "categories": [
      "Film & Music"
    ]
  },
  {
    "name": "THE TAPE",
    "role": "Executive Producer",
    "description": "",
    "url": "https://www.youtube.com/watch?v=Gq9L3dYWdBs&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/7nIMvdwiijHasaaIcqEWgbIzU.png",
    "imageAlt": null,
    "categories": [
      "Film & Music"
    ]
  },
  {
    "name": "WZRD.tech",
    "role": "Cognitive Architect & Founder",
    "description": "OS On-Chain Agent Marketplace for Personal Wellness & Creator Agents",
    "url": "https://www.youtube.com/watch?v=iwKgXlec_O4&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/OaF9wCEH0CwCFhZZfXb4EFfKbY.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Web3"
    ]
  },
  {
    "name": "TEMAZCAL",
    "role": "Full Stack Developer & Filmmaker",
    "description": "",
    "url": "https://www.youtube.com/watch?v=OYVc22ODzMs&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/hWTSHEglTwXoRNPXClu4aZqoU.png",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "AI & Agents"
    ]
  },
  {
    "name": "aiMessages",
    "role": "Cognitive Architect & Full-Stack Dev",
    "description": "",
    "url": "https://youtu.be/krOB9uBymXs",
    "image": "https://framerusercontent.com/images/cIf971ib0bbW6YRTzJb7b9nzzk.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents"
    ]
  },
  {
    "name": "the ten mahavidya",
    "role": "Visual Artist & Filmmaker",
    "description": "",
    "url": "https://youtu.be/dKZ9pKXL0EE",
    "image": "https://framerusercontent.com/images/zpjQyGTSErwEZdWmLYtTRRXFdeA.png",
    "imageAlt": null,
    "categories": [
      "Film & Music"
    ]
  },
  {
    "name": "the Shift Podcast",
    "role": "Audio Engineer and Executive Producer",
    "description": "A podcast made with Generative AI that has two AI hosts covering a range of the lates topics and research papers.",
    "url": "https://www.youtube.com/watch?v=TV2HFTr40a4&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/24W3AMTuFtzfoA79997buOqesT8.png",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "AI & Agents",
      "Community & Events"
    ]
  },
  {
    "name": "the Shfit #SFTechWeek",
    "role": "Event Coordinator and Speaker",
    "description": "Event put together with a16z's #SFTechWeek",
    "url": "https://www.youtube.com/watch?v=nFnP-LztL2Q&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/YKVcIpnf6fUMfkytu9HYyQj0MM.png",
    "imageAlt": null,
    "categories": [
      "Community & Events"
    ]
  },
  {
    "name": "agency",
    "role": "Founder & Creative Director",
    "description": "The World's First Spatial Agent for Healing and Meditation",
    "url": "https://youtu.be/vduz8ynK9NQ",
    "image": "https://framerusercontent.com/images/FTeWBN91viRjBe2F6zqPOTe5EPg.png",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "AI & Agents"
    ]
  },
  {
    "name": "aiden : open-source democracy",
    "role": "Cognitive Architect and Full-Stack AI Engineer",
    "description": "GenAI Media Training for Politicians",
    "url": "https://youtu.be/PsUtzZ0HSl8",
    "image": "https://framerusercontent.com/images/DIo9oSUggDoqVjcKJGBP3fhUELc.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents"
    ]
  },
  {
    "name": "01 - OpenInterpreter",
    "role": "Designer",
    "description": "World's First OS Human Interaction AI Wearable w/ Computer Use",
    "url": "https://youtu.be/WbPVnEpVS-Y",
    "image": "https://framerusercontent.com/images/Ch2kpRuytrZtxMAFxER7oOxh1Yk.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "Truecrime VR (DreamXR Meta x F.Inc Hackathon)",
    "role": "Design Engineer, Spatial Experiences Engineer",
    "description": "Go through a crime scene in VR",
    "url": "https://youtu.be/3P7p4_xGCNw",
    "image": "https://framerusercontent.com/images/KyzB6MjgUymCu3hiqc8QMgfIEk.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "akasha : a new earth | MIT AI Film Hackathon '24",
    "role": "creative director; 1-Man Pixar Studio",
    "description": "immersive GenAI/XR experience for TAOGPT",
    "url": "https://www.youtube.com/watch?v=zyPgz9YvfNg",
    "image": "https://framerusercontent.com/images/99oFFf1AwRfXh3y0txAf9ptsE.webp",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music",
      "AI & Agents"
    ]
  },
  {
    "name": "spatialCraft | GPT Store Hackathon ' Jan. '24",
    "role": "full-stack dev (prompt engineer)",
    "description": "generate visionOS UI compononents using natural language",
    "url": "https://www.youtube.com/watch?v=RYxodRN_ecM&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/aiVqCcgRPjg0L2Zfu2EIHs6ubME.webp",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents"
    ]
  },
  {
    "name": "NESGPT | Emergency Hackathon '23",
    "role": "cognitive architect, UI/UX, backend engineer, video guy",
    "description": "a custom GPT for identifiying, optimizing, and providing solutions to carbon sinks in your area using GPT-4V and Dino-SAM.",
    "url": "https://www.youtube.com/watch?v=1yWgK-X4S9M",
    "image": "https://framerusercontent.com/images/b9YxBtKS5nyVV1HXkGFvcQaR6MI.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "new earth v0 | GEN48",
    "role": "director, animator, editor, producer",
    "description": "GenAI short film made in under 12 hours",
    "url": "https://youtu.be/fPLUP3ZMcuo",
    "image": "https://framerusercontent.com/images/IpT0IeEgahsA0P6znQtSKS8oc.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music"
    ]
  },
  {
    "name": "agency v0",
    "role": "project manager and cognitive architect",
    "description": "spatial agent for healing",
    "url": "https://www.youtube.com/watch?v=nsciIm_6WfQ&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/GehWSMecODZQu4DmCFkKXqqWo.svg",
    "imageAlt": null,
    "categories": [
      "AI & Agents"
    ]
  },
  {
    "name": "TAOGPT-7B",
    "role": "project manager and cognitive architect",
    "description": "TaoGPT-7B is particularly useful for academic research, educational purposes, and professional consultations in the fields of quantum physics and information theory. It is an ideal tool for researchers, educators, and professionals seeking deep, scientifically grounded insights into these complex subjects.",
    "url": "https://huggingface.co/agency888/TaoGPT-v1",
    "image": "https://framerusercontent.com/images/3gYd0yfn0FD9vCnRJRnAmk8a2ek.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents"
    ]
  },
  {
    "name": "WIsdom 3.0 Summit",
    "role": "Creative Diector and Project Manager",
    "description": "wisdom 3:0 : agents, network states, and longevity",
    "url": "https://www.youtube.com/watch?v=uAE1Rc5-mfU&ab_channel=MarilynSmith",
    "image": "https://framerusercontent.com/images/C8wDkL6sUs8Z3HVMSO6UchI4eo.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Community & Events"
    ]
  },
  {
    "name": "ai x art hackathon | studio45",
    "role": "cognitive architect",
    "description": "affective immersive experience with real-time emotion detection and shaders",
    "url": "https://www.youtube.com/watch?v=W4OiHo7OyK8&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/AoTwITX7sofGapvRvIWhoZSsn2k.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents"
    ]
  },
  {
    "name": "traquilai | DreamScape Hackathon '23 AGI House",
    "role": "UI/UX Designer and Cognitive Architect",
    "description": "MultiModal Meditation Application that utilizes the Quest 3, Real-Time Emotion-Detection, LLava, and MusicGen for a realtime meditation agent",
    "url": "https://x.com/AlexReibman/status/1716369687871971741?s=20",
    "image": "https://framerusercontent.com/images/vUuvWLWhKj48QhhMqcVNrld8A.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "ssense : the future of martech | TED MultiModal Hackathon Oct. '23",
    "role": "cognitive architect & product manager",
    "description": "utilizing emotion + gaze detection to create value through attention",
    "url": "https://www.youtube.com/watch?v=rBcGQBbhQnU&ab_channel=5-DeeStudios",
    "image": "https://framerusercontent.com/images/aGV34ubSKHdx7WrtuDK65XRGg.png",
    "imageAlt": null,
    "categories": [
      "Hackathons"
    ]
  },
  {
    "name": "STIM",
    "role": "UI/UX and video guy",
    "description": "agent for notification relevancy filtration",
    "url": "https://www.youtube.com/watch?v=UOU1hIPh_uE&t=108s&ab_channel=WesRoth",
    "image": "https://framerusercontent.com/images/1fqNRxn19GUPytJObspqk3naM.png",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "agency @ buildspace IRL s4",
    "role": "product manager, full-stack developer, interaction designer",
    "description": "an open-source privacy preserving platform for spatial agents",
    "url": "/agency",
    "image": "https://framerusercontent.com/images/NDiPOrZ6y0edtl0w3mLi8DvlKg.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "empathic.ai @ Empathy Hackathon by GenLab",
    "role": "Product Manager, Cognitive Archtiect, Full-Stack Dev, UI/UX Designer, Marketing",
    "description": "Affective AI at the touch of a button",
    "url": "https://www.youtube.com/watch?v=YUEVBAcpGvY&ab_channel=5-DeeTV",
    "image": "https://framerusercontent.com/images/3EFgtq9ePC0sLudALCOk3ziZi8s.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "shellie (🥇 @ seamlessM4T Hackathon by lablab.ai)",
    "role": "Team Leader, Web Dev, Cognitive Architecture for SM4T, and Presentation",
    "description": "",
    "url": "https://lablab.ai/event/seamlessm4t-24-hours-hackathon/5-dee-studios/shellie",
    "image": "https://framerusercontent.com/images/6xKmB7FpIi0gZHno1XXjnMqtIPc.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents"
    ]
  },
  {
    "name": "yee! : your personal sports agent (Warriors x ArenaX Hackathon '23)",
    "role": "Full-stack Dev, UI/UX Designer, BizOps, etc.",
    "description": "Democratizing knowledge work for athletes, creatives, and brands.",
    "url": "https://devpost.com/software/yee?ref_content=user-portfolio&ref_feature=in_progress",
    "image": "https://framerusercontent.com/images/dvCVYOtRj42547WJwe7x3bXQ8.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "LoFi Focus (🥇 @ Audiocraft 24HR Hackathon by lablab.ai)",
    "role": "Audio Engineer, MLOps, UI/UX, Design/Marketing",
    "description": "Generate LoFi hip-hop tracks tailored to your current website, a personalized deep work music player for you.",
    "url": "https://lablab.ai/event/audiocraft-24-hours-hackathon/kbve/lofi-focus",
    "image": "https://framerusercontent.com/images/7apKhg0yOgiYrwiZM8PwdLtKHWs.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "Film & Music",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "project ATLAS (@ Autonomous Agents Hackathon by lablab.ai)",
    "role": "BizOps/MLOps, Cognitive Architect for Agent Sub-Routines, Marketing",
    "description": "Helping venture capital and startups develop an MvP with real-time data in under ten minutes.",
    "url": "https://lablab.ai/event/autonomous-agents-hackathon/kbve/atlas",
    "image": "https://framerusercontent.com/images/g9UT6X5NbJD8arQd9Db161bgNS8.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "Spatial Generation @ OutsideLLMS Hackathon by CODEMAKERS",
    "role": "Multi-modal Gen AI researcher, Cognitive Architect, and UI/UX Designer",
    "description": "Generate audio tracks based on enviromental variables with a focus on enhancing artist-fan experiences at live venues using AR.",
    "url": "https://devpost.com/software/spacegen",
    "image": "https://framerusercontent.com/images/hax11qv8inK0twrhQ6ZsgO8iRw.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "FlowAI (🥉@ 3D Gen AI Hackathon by lablab.ai)",
    "role": "Cognitive Architect, UI/UX, Multi-modal Data Pipelines",
    "description": "Generate 3D Game and Audio Assets on one platform.",
    "url": "https://lablab.ai/event/3d-ai-models-hackathon/flowai/crafting-3d-gaming-experiences-with-flow-ai",
    "image": "https://framerusercontent.com/images/lMNHkzis1vcVzoWskp8Lix45POc.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "ToL 3D dApp (🥉 @ 3D Gen AI Hackathon by lablab.ai)",
    "role": "Creative Developer, Cognitive Architect, BizOps",
    "description": "Developed a simple webapp that converts any 2D image of clothing to a 3D model in under 45 seconds for AR wearable purposes.",
    "url": "https://lablab.ai/event/3d-ai-models-hackathon/klurdy-ai/thread-of-life",
    "image": "https://framerusercontent.com/images/d12Y3FF67tm56hIIL9f1zYuuPWk.gif",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents"
    ]
  },
  {
    "name": "The Thread of Life Protocol @ buildspace IRL s3",
    "role": "Project Manager, Developer, Operations",
    "description": "On-Chain Creator Merchandising for Artists and Brands",
    "url": "https://monksandmagic.dora.run/",
    "image": "https://framerusercontent.com/images/c5p20XZbLK74lXA4pxymhQKVUD4.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Web3",
      "Brand & Design"
    ]
  },
  {
    "name": "Clarity.AI (🥇 @ AISF '23 by F.Inc)",
    "role": "Hacker/Researcher",
    "description": "AISF HACKATHON WINNER : 1st Place in Generative AI",
    "url": "https://docs.google.com/presentation/d/1hVCvX7XlQP6mJJUgy1YHDo77U73ohAeIHaUWBIdHwFE/edit?usp=sharing",
    "image": "https://framerusercontent.com/images/BKtuGRot3UrlJniKNviTSI7YQ.png",
    "imageAlt": null,
    "categories": [
      "Hackathons",
      "AI & Agents"
    ]
  },
  {
    "name": "PCKG.AI",
    "role": "Get personalized logos and artwork in seconds!",
    "description": "Create your customized logos and artwork in seconds with PCKG.AI",
    "url": "https://playai.live/pckgai",
    "image": "https://framerusercontent.com/images/AcyVAULbVaKFTBL3vRlqLV5aA.png",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "PLAY.AI @ buildspace IRL s2",
    "role": "Create-2-Earn AI Business Tools Application",
    "description": "Part of Nights & Weekend Season 2, this tool is here to supercharge your business for the creator economy.",
    "url": "https://playai.live",
    "image": "https://framerusercontent.com/images/oJSRZR0PyEEyk102H3i9HlXvp8.gif",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Brand & Design"
    ]
  },
  {
    "name": "MONKS&MAGIC",
    "role": "",
    "description": "On-Chain Etheric Wear",
    "url": "https://instagram.com/monksandmagic",
    "image": "https://framerusercontent.com/images/aHSAgbgOlKWzmn6S8AIIeqEhHg.gif",
    "imageAlt": null,
    "categories": [
      "Web3"
    ]
  },
  {
    "name": "WATR Album Merchandise Drop",
    "role": "",
    "description": "",
    "url": "https://drokthemenace.gumroad.com/",
    "image": "https://framerusercontent.com/images/c7fMj84xIyKW8GVLISB4RCfrAJk.gif",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "Brand & Design"
    ]
  },
  {
    "name": "HASH DAO",
    "role": "Highly Autonomous Systems of Horticulture",
    "description": "HASH DAO has been created to allow easier access in the cannabis space and easier integration into the emerging technologies of the blockchain and Web3. Focusing on farmers who put the plant first and under represented communities. To do this, we start by partnering with Uncle Mac's brand to create community tooling. And a growing compilation of automation protocols using smart contracts. HASH DAO Governance seeks to be the future industry standard.",
    "url": "https://hashdao3.webflow.io/",
    "image": "https://framerusercontent.com/images/Ci1c2iEaZKuR4qZJlc9z4s3FefQ.png",
    "imageAlt": null,
    "categories": [
      "Web3",
      "Brand & Design"
    ]
  },
  {
    "name": "T.R.A.P. Therapy",
    "role": "World's First Metaverse Therapy",
    "description": "T.A.O Tech Healing",
    "url": "",
    "image": "https://framerusercontent.com/images/KH5PRPEw9K8u0tG6awVuuGEMEMs.gif",
    "imageAlt": null,
    "categories": [
      "Web3"
    ]
  },
  {
    "name": "Uncle Mac's 7/10 Drop",
    "role": "UI/UX Developer & Web3/AI Strategiest",
    "description": "Design and develop the Ui/UX for Uncle Mac's website and packaging for the yearly 7/10 drop and create marketing strategies to increaes sales throughout the state of California. During this time, our team developed HASH DAo, a part of which included creatting an NFT strategy for the product drop as well as developing 3D/AR assets.",
    "url": "",
    "image": "https://framerusercontent.com/images/g4j16JmFI4kqL3pNpvRfHhjRCd8.gif",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Web3",
      "Brand & Design"
    ]
  },
  {
    "name": "ALPA GOLF DIstribution",
    "role": "Branding, Product Strategy, Web Design and Development, & Distribution",
    "description": "",
    "url": "https://job-sip-161304.framer.app/",
    "image": "https://framerusercontent.com/images/APhHH88VAatyFUlBp2Q123oPI.gif",
    "imageAlt": null,
    "categories": [
      "Brand & Design"
    ]
  },
  {
    "name": "Thread of Life Protocol",
    "role": "Developing on-chain merchandising and products for the creator economy.",
    "description": "Integreating the digital and physical worlds to create on-chain products and merchandising for brands and artists. From manufacturing and producing immersive artist's album A/R merch such as WATR for D'rok the Menace to creating digital assets for ALPA GOLF distribution of Regatta Club and Kinloch Anderson, the Thread of Life protocol is here to create a one-stop shop for creatives and the problem of fast fashion.",
    "url": "https://www.instagram.com/threadoflifesamples/",
    "image": "https://framerusercontent.com/images/MfUxhnKtmgnUBAg6qyssdtpvf8.gif",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "Web3",
      "Brand & Design"
    ]
  },
  {
    "name": "Thunderbolt DAO / Zooties NFT",
    "role": "Web3/NFT Music Strategiest",
    "description": "Develop the Thundrbolt DAO UI/UX and strategy to help decentralize music distribution and creator splits through smart contracts and Web3 dApps; created the NFT strategy for Future's cannabis and clothing brand, Zooties",
    "url": "https://hashdao-nft-landing-page-project.webflow.io",
    "image": "https://framerusercontent.com/images/9VuCqn8OfDYsFqdEJIvO7GIXq4.gif",
    "imageAlt": null,
    "categories": [
      "Film & Music",
      "Web3",
      "Brand & Design"
    ]
  },
  {
    "name": "T.R.A.P. Productions",
    "role": "Metaverse Digital Asset Production House",
    "description": "Audio/Visual Production 🎥 3D Modeling, A/R & V/R, & Animation 👾",
    "url": "https://www.instagram.com/t.r.a.p.productions/",
    "image": "https://framerusercontent.com/images/OTc7G0gk7CBqV217YYuC6t5NrXk.gif",
    "imageAlt": null,
    "categories": [
      "Web3"
    ]
  },
  {
    "name": "Abundance Business Concepts",
    "role": "A Creative Handbook for the New Earth",
    "description": "After 10+ years of business experience in various industries including energy management, the cannabis industry, and holistic health, this book aims to be a comprehensive guide to the next decade of business and commerce. It's highlights include tuning into the right spirit and mind of abundance, emerging markets, global ESG metrics, and e-commerce strategies. With close to 6 figures worth of courses and professional mentoring and over a million dollars worth of game, GRATITUDE presents Abundance Business Concepts.",
    "url": "",
    "image": "https://framerusercontent.com/images/lCnpUevmenI98gHFkvHmfvUHLPU.gif",
    "imageAlt": null,
    "categories": [
      "Brand & Design"
    ]
  },
  {
    "name": "Way 2 Long Single Release",
    "role": "",
    "description": "",
    "url": "",
    "image": "https://framerusercontent.com/images/ChxgLUnZOJ4jhTUhuPbL65bQueQ.gif",
    "imageAlt": null,
    "categories": [
      "Film & Music"
    ]
  },
  {
    "name": "Soul Power w/ Marilyn Smith",
    "role": "Brand Strategiest, UI/UX Developer, and Content Creator",
    "description": "Meng To's book totally changed my design workflow. It even inspired me to start design workshops and YouTube tutorials.",
    "url": "https://suggestions-ought-559825.framer.app/",
    "image": "https://framerusercontent.com/images/i4I8QGi617sBxlOX2Xa6Wa7czpw.jpg",
    "imageAlt": null,
    "categories": [
      "AI & Agents",
      "Brand & Design"
    ]
  }
];
