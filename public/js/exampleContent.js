// Global example content for previews
// This file defines window.ExampleContent so it can be used by plain script tags (no modules)
(function() {
  window.ExampleContent = window.ExampleContent || {};

  // About page example sections
  window.ExampleContent.about = {
    education: `
      <p><strong>2023</strong> - BFA in Fine Arts, [University Name]</p>
      <p><strong>2021</strong> - Certificate in Traditional Painting Techniques, [Art School]</p>
    `,
    workExperience: `
      <p><strong>2023-Present</strong> - Freelance Artist</p>
      <p><strong>2022-2023</strong> - Gallery Assistant, [Gallery Name]</p>
    `,
    recentlyFeatured: `
      <p><strong>2024</strong> - Art Magazine Feature</p>
      <p><strong>2024</strong> - Online Gallery Spotlight</p>
    `,
    selectedExhibition: `
      <p><strong>2024</strong> - "Contemporary Visions" Group Show, [Gallery Name]</p>
      <p><strong>2023</strong> - "Emerging Artists" Solo Exhibition, [Gallery Name]</p>
    `,
    selectedPress: `
      <p><strong>2024</strong> - Featured in [Art Publication]</p>
      <p><strong>2023</strong> - Interview with [Magazine Name]</p>
    `,
    selectedAwards: `
      <p><strong>2024</strong> - Emerging Artist Grant</p>
      <p><strong>2023</strong> - Excellence in Fine Arts Award</p>
    `,
    selectedProjects: `
      <p><strong>2024</strong> - Community Mural Project</p>
      <p><strong>2023</strong> - Artist Talk at [Institution]</p>
    `,
    contactInfo: `
      <p>Email: <a href="mailto:artist@email.com" style="color: #333;">artist@email.com</a></p>
      <p>Phone: [Phone Number]</p>
      <p>Studio: [Address]</p>
    `
  };

  // Home page example data organized by medium
  window.ExampleContent.home = {
    painting: {
      title: "Contemporary Painting Studio",
      subtitle: "Exploring color, form, and emotion through paint",
      description: "My paintings explore the intersection of color and emotion, creating vibrant compositions that speak to the human experience.",
      featured: { cleanContent: "Featured Painting", morandiStyle: "background: #d9c7b7;" },
      hero: { cleanContent: "Latest Work", morandiStyle: "background: #e8ddd4;" }
    },
    photography: {
      title: "Visual Storytelling",
      subtitle: "Capturing moments that matter",
      description: "Through my lens, I capture the beauty in everyday moments and the extraordinary in the ordinary.",
      featured: { cleanContent: "Featured Photo", morandiStyle: "background: #8a9a9a;" },
      hero: { cleanContent: "Latest Shot", morandiStyle: "background: #9aa5aa;" }
    },
    poetry: {
      title: "Words & Verses",
      subtitle: "Poetry that speaks to the soul",
      description: "My poetry explores themes of love, loss, hope, and the human condition through carefully crafted verses.",
      featured: { cleanContent: "Featured Poem", morandiStyle: "background: #b5a8c7;" },
      hero: { cleanContent: "Latest Verse", morandiStyle: "background: #c7a8b5;" }
    },
    furniture: {
      title: "Functional Art",
      subtitle: "Where design meets craftsmanship",
      description: "I create furniture pieces that blend functionality with artistic expression, using sustainable materials and traditional techniques.",
      featured: { cleanContent: "Featured Piece", morandiStyle: "background: #a89082;" },
      hero: { cleanContent: "Latest Creation", morandiStyle: "background: #c4b082;" }
    },
    'multi-medium': {
      title: "Mixed Media Art",
      subtitle: "Exploring creativity across mediums",
      description: "My work spans multiple mediums, combining traditional and contemporary techniques to create unique artistic expressions.",
      featured: { cleanContent: "Featured Work", morandiStyle: "background: #c7b5a8;" },
      hero: { cleanContent: "Latest Project", morandiStyle: "background: #b5c7a8;" }
    }
  };

})();
