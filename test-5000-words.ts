import { extractFromSegments } from './app/engine/extract/orchestrator';

async function test() {
  const text = `
The story of Zenith Computing began in 1985 when three graduate students at Carnegie Mellon University decided to leave their PhD programs and start a company. Robert Morrison, Sarah Chen, and David Williams had been working together in the robotics lab under the guidance of Professor Margaret Anderson. Dr. Anderson had encouraged them to commercialize their research on computer vision systems, even offering to serve as their technical advisor.

Robert Morrison was the eldest son of Thomas Morrison, a mechanical engineer who worked at General Motors in Detroit. His mother, Elizabeth Morrison, taught mathematics at the University of Michigan. Robert had graduated from MIT with a degree in electrical engineering before coming to Carnegie Mellon for his graduate studies. There he met his future wife, Jennifer Park, who was studying computer science in the same department. They married in 1984, just a year before founding Zenith Computing.

Sarah Chen came from a family of academics. Her father, Dr. James Chen, was a physics professor at Stanford University, while her mother, Dr. Linda Chen, taught chemistry at Berkeley. Sarah's younger brother, Michael Chen, was still an undergraduate at Stanford when she left to start the company. Michael would later join Zenith Computing as one of its first engineers after graduating in 1987.

David Williams grew up in Seattle, where his father Richard Williams owned a small manufacturing business. His mother, Patricia Williams, was a nurse at Seattle Children's Hospital. David's sister, Rebecca Williams, worked as a lawyer at a firm in downtown Seattle and would later help Zenith Computing with their legal incorporation and patent filings.

The three founders moved to Silicon Valley in early 1985, renting a small office in Mountain View. They hired their first employee, Kevin Zhang, a talented programmer who had recently graduated from Stanford. Kevin's wife, Amy Zhang, worked as an accountant at Hewlett-Packard and helped the startup with their financial planning in the early days.

Professor Anderson introduced the founders to Alexander Petrov, a venture capitalist at Sequoia Capital who had previously invested in several successful technology companies. Alexander was impressed by their vision and agreed to lead their seed round, investing five hundred thousand dollars in exchange for a twenty percent stake in the company. His partner at Sequoia, Katherine Rodriguez, also participated in the round and joined the board of directors.

By 1987, Zenith Computing had grown to fifteen employees. They recruited heavily from Carnegie Mellon, bringing in graduates like Daniel Kim, who had studied under Professor Anderson in the robotics lab. Daniel's wife, Lisa Kim, was a product manager at Apple in Cupertino and occasionally provided feedback on Zenith's product direction. The couple lived in Palo Alto with their two children.

Robert Morrison's brother, Andrew Morrison, joined the company as Chief Financial Officer after spending five years at Goldman Sachs in New York. Andrew had graduated from Harvard Business School in 1982 and brought valuable financial expertise to the growing startup. He convinced his former classmate, Marcus Johnson, to leave his position at McKinsey and join Zenith as Chief Operating Officer.

The company secured their Series A funding in 1988, led by Kleiner Perkins. The partner who championed the deal was Victoria Chen, who happened to be Sarah Chen's cousin. Victoria had earned her MBA from Stanford and had been working in venture capital for three years. The ten million dollar round valued Zenith Computing at forty million dollars.

Sarah Chen recruited her former roommate from Stanford, Rachel Thompson, to head the marketing department. Rachel had been working at Intel in Santa Clara and brought deep experience in product marketing for technical products. Her husband, Christopher Thompson, was a civil engineer who worked on infrastructure projects throughout the Bay Area.

In 1990, Zenith Computing opened their first international office in London. They sent David Williams to lead the European expansion. David's wife, Emily Williams, whom he had married in 1988, accompanied him to England. Emily had been working as a research scientist at Stanford Research Institute but was excited about the opportunity to live abroad. The couple spent three years in London before returning to California.

The London office was managed by Jonathan Blake, a Cambridge University graduate who had previously worked at British Telecom. Jonathan's father, Sir Edmund Blake, was a prominent British businessman who had founded several successful companies and provided valuable introductions to potential customers in Europe. Jonathan's sister, Catherine Blake, worked as an investment banker at Barclays and helped structure some of Zenith's early European partnerships.

Meanwhile, back in California, the engineering team continued to expand. Robert Morrison hired Dr. Yuki Tanaka, a brilliant researcher who had just completed her postdoctoral work at MIT. Dr. Tanaka had studied under Professor Richard Foster, a renowned expert in artificial intelligence. She brought cutting-edge expertise in machine learning that would prove crucial for Zenith's next generation of products.

Dr. Tanaka's husband, Hiroshi Tanaka, was a software engineer at Sun Microsystems. The couple lived in Sunnyvale with their daughter, Akiko. Yuki's brother, Kenji Nakamura, was a professor at Tokyo University and helped Zenith establish partnerships with Japanese technology companies.

In 1992, Zenith Computing went public on the NASDAQ exchange. The IPO was managed by Morgan Stanley, with the lead banker being Gregory Martin. Gregory had previously worked at Lehman Brothers before joining Morgan Stanley in 1989. His team included analysts like Nina Patel, who had graduated from Wharton School of Business and specialized in technology companies.

The successful IPO made the founders and early employees wealthy. Robert Morrison used some of his proceeds to endow a scholarship at MIT for engineering students. Professor Anderson, who still owned advisory shares in the company, donated her portion to Carnegie Mellon to establish a robotics research center named in honor of her late husband, Dr. Philip Anderson, who had been a computer science professor at the university.

Sarah Chen's brother Michael, who had joined the company as employee number seven, was now leading a team of thirty engineers. He married his longtime girlfriend, Sophie Laurent, a French designer who worked at Adobe in San Jose. The wedding was held in Napa Valley, with Robert Morrison serving as the best man. Michael's parents, Dr. James Chen and Dr. Linda Chen, traveled from California to attend the celebration.

The mid-1990s brought new challenges and opportunities. Zenith Computing acquired a smaller competitor, DataVision Systems, which had been founded by Eric Nelson and Maria Garcia. Eric had previously worked at IBM in Armoneda before starting DataVision in 1991. Maria had been his colleague at IBM and brought expertise in database systems. Both founders joined Zenith's leadership team after the acquisition.

Maria Garcia's husband, Carlos Garcia, was a professor at UC Santa Cruz teaching computer science. He became a technical consultant for Zenith, helping them develop educational programs. Their daughter, Isabella Garcia, was studying engineering at Stanford and would later intern at Zenith during her summer breaks.

The company expanded into Asia in 1996, opening offices in Tokyo and Singapore. The Tokyo office was led by Kenji Nakamura, Dr. Yuki Tanaka's brother, who left his position at Tokyo University to join Zenith full-time. He recruited Takeshi Yamamoto, a former Sony engineer who brought valuable experience in the Japanese market. Takeshi's wife, Yumi Yamamoto, worked as a translator and helped bridge cultural differences between the American and Japanese teams.

The Singapore office was managed by Vincent Tan, who had graduated from National University of Singapore with a degree in computer science. Vincent had previously worked at a local startup before being recruited by Katherine Rodriguez, the Sequoia partner who sat on Zenith's board. Vincent's brother, William Tan, was a lawyer in Singapore and helped navigate the complex regulatory environment.

Back in Silicon Valley, the next generation was beginning to make their mark. Jennifer Park, Robert Morrison's wife, had taken a break from her career to raise their three children but returned to work in 1997 as a senior engineer at Zenith. She led a team that included recent graduates like Alexandra Foster, the daughter of Professor Richard Foster from MIT. Alexandra had studied computer science at Berkeley and was eager to work on challenging technical problems.

David Williams recruited his nephew, Thomas Wilson, to join the sales team. Thomas was the son of David's sister Rebecca Williams and her husband John Wilson, a software engineer at Microsoft. Thomas had graduated from the University of Washington with a business degree and brought energy and enthusiasm to the sales organization.

The dot-com boom of the late 1990s created both opportunities and challenges for Zenith Computing. The company's stock price soared as investors poured money into technology companies. Andrew Morrison, the CFO, worked closely with Wall Street analysts like Diana Chang, who covered technology stocks for Credit Suisse. Diana had graduated from Columbia Business School and had built a reputation for insightful analysis of software companies.

In 1998, Zenith Computing established a venture capital arm to invest in promising startups. The fund was managed by Paul Henderson, who had joined the company after spending five years at Benchmark Capital. Paul's wife, Sandra Henderson, was a patent lawyer at a firm in Palo Alto and occasionally helped Zenith's portfolio companies with intellectual property matters.

The first investment from Zenith Ventures went to a small startup called CloudTech, founded by two Berkeley graduates named Jason Lee and Priya Sharma. Jason had previously worked at Oracle in Redwood City, while Priya had been a researcher at Xerox PARC. The two had met at a technology conference and discovered they shared a vision for cloud computing infrastructure.

Priya Sharma's father, Dr. Raj Sharma, was a computer science professor at UC Berkeley and had been one of her mentors during her undergraduate years. Her mother, Anjali Sharma, worked as a software architect at Cisco Systems. Priya's younger sister, Neha Sharma, was studying medicine at UCSF and represented a different path from the family's technology focus.

The dot-com crash of 2000 hit Zenith Computing hard. The stock price fell by seventy percent, and the company was forced to lay off twenty percent of its workforce. Robert Morrison, now CEO, made the difficult decisions necessary to keep the company alive. He was supported by his longtime friend and co-founder David Williams, who had returned from London to help navigate the crisis.

Sarah Chen, the third co-founder, had stepped back from day-to-day operations in 1999 to spend more time with her family. She and her husband, Peter Kim, whom she had married in 1995, had two young children. Peter was a professor at Stanford teaching economics, and Sarah occasionally gave guest lectures in his entrepreneurship classes, sharing lessons learned from building Zenith Computing.

The company survived the downturn and emerged stronger. Marcus Johnson, the COO, led a major restructuring that streamlined operations and refocused the product line. He worked closely with Rachel Thompson, who had been promoted to Chief Marketing Officer, to rebrand the company and target new markets. Rachel's strategic vision helped Zenith Computing pivot from selling primarily to large enterprises to also serving small and medium businesses.

In 2003, Zenith Computing celebrated its first profitable quarter since the crash. The recovery was marked by a company-wide celebration at the headquarters in Mountain View. Professor Margaret Anderson, now retired from Carnegie Mellon, flew out to attend and gave an inspiring speech about the importance of perseverance and innovation.

The mid-2000s saw new leadership emerging within the company. Daniel Kim, who had joined in 1987 as a junior engineer, was promoted to Chief Technology Officer. His wife Lisa had left Apple to start her own consulting firm, advising technology companies on product strategy. Daniel recruited Dr. Stephanie Wu, a machine learning expert who had completed her PhD at Stanford under the supervision of Professor Andrew Chen, Sarah Chen's father who had shifted his research focus from physics to computer science.

Dr. Wu's husband, Brian Chen, worked as a designer at IDEO in Palo Alto. The couple lived in Menlo Park with their son. Stephanie's younger brother, Jeffrey Wu, was a venture capitalist at Andreessen Horowitz and provided valuable insights into emerging technology trends.

In 2007, Zenith Computing made its largest acquisition to date, purchasing MobileFirst Technologies for two hundred million dollars. The startup had been founded by former Zenith employees Matthew Brooks and Lauren Davis, who left in 2004 to pursue their vision of mobile computing. Matthew had been one of the early engineers working under Michael Chen, while Lauren had been in the marketing department reporting to Rachel Thompson.

Matthew Brooks came from a technology family. His father, Dr. Charles Brooks, was a computer science professor at Cornell University, and his mother, Helen Brooks, had been one of the first female engineers at IBM in the 1960s. Matthew's sister, Emma Brooks, worked as a venture capitalist at Greylock Partners and had considered investing in MobileFirst before the Zenith acquisition.

Lauren Davis had graduated from Northwestern University before joining Zenith in 1996. Her husband, Nathan Davis, was a journalist who covered technology for the Wall Street Journal. The couple lived in San Francisco with their two daughters. Lauren's brother, Ryan Miller, worked as a product manager at Google and provided perspective on how the search giant was approaching mobile technology.

The acquisition brought fresh talent and ideas to Zenith Computing. Matthew and Lauren joined the executive team, and their employees integrated smoothly with the existing organization. One of their key hires had been Omar Hassan, a talented engineer who had previously worked at Qualcomm in San Diego. Omar's wife, Fatima Hassan, was a physician at Stanford Hospital, and the couple had relocated to the Bay Area when Omar joined MobileFirst.

By 2010, Zenith Computing had grown to over three thousand employees worldwide. Robert Morrison, now in his early fifties, began thinking about succession planning. He promoted Daniel Kim to President, while remaining as CEO and Chairman. Andrew Morrison, his brother, announced plans to retire as CFO after twenty-three years with the company. His replacement was Michelle Park, who had been serving as the corporate controller and had previously worked at Deloitte.

Michelle Park was not related to Jennifer Park, Robert's wife, despite sharing a surname. She had graduated from UCLA with an accounting degree and earned her MBA from USC Marshall School of Business. Her husband, David Park, was a real estate developer in San Francisco. Michelle's sister, Christine Lee, worked as an investment banker at JPMorgan Chase.

The company continued to innovate and adapt. Dr. Yuki Tanaka, who had joined in 1991, was now leading the artificial intelligence research lab. She mentored young researchers like Gabriel Santos, who had completed his PhD at MIT under Professor Richard Foster before joining Zenith in 2009. Gabriel's wife, Isabella Santos, worked as a lawyer at a firm in San Francisco specializing in technology law.

Gabriel's brother, Antonio Santos, was pursuing his own entrepreneurial dreams. He had founded a startup called DataStream with his college friend Olivia Martinez. Olivia had graduated from Berkeley with a computer science degree and had worked at Facebook in Menlo Park before starting DataStream. Her father, Carlos Martinez, owned a successful restaurant chain in Los Angeles, and her mother, Rosa Martinez, was a teacher.

Zenith Ventures, the company's investment arm, invested in DataStream in 2011. The deal was led by Paul Henderson, who had been managing the fund since its inception. Paul saw potential in Antonio and Olivia's vision for real-time data analytics. His investment thesis was validated when DataStream began attracting major customers in the financial services industry.

The investment created an interesting connection between Gabriel Santos at Zenith and his brother Antonio at DataStream. The two companies began collaborating on several projects, with Dr. Tanaka's AI team at Zenith providing technical expertise to DataStream's engineering team. This partnership was facilitated by Marcus Johnson, who had become Zenith's Chief Strategy Officer after stepping down as COO in 2009.

In 2012, Zenith Computing opened a major research facility in Austin, Texas. The decision was driven by the lower cost of living and the presence of the University of Texas, which produced strong engineering graduates. The facility was led by Dr. Alan Foster, the son of Professor Richard Foster from MIT. Alan had completed his PhD at Berkeley and had been working at Zenith's headquarters before being selected to lead the Austin expansion.

Dr. Foster recruited heavily from the University of Texas, bringing in graduates like Samantha Rodriguez and James Wilson. Samantha had studied computer science and was particularly interested in distributed systems. Her boyfriend, Tyler Johnson, was completing a graduate degree at UT Austin in electrical engineering. James Wilson had no relation to Thomas Wilson from the sales team, despite sharing a name. He had grown up in Houston and was excited to work in Texas rather than relocating to California.

The Austin facility attracted researchers from around the country. Dr. Emily Crawford joined from Georgia Tech, where she had been an assistant professor. Her husband, Mark Crawford, found work as a software engineer at Dell in Round Rock. Their decision to move to Austin was influenced by Emily's former advisor, Professor Susan Mitchell, who had connections to Zenith through academic conferences and had strongly recommended the opportunity.

Back in California, changes were happening at the leadership level. Sarah Chen, the co-founder who had stepped back in 1999, returned to the company in 2013 as Chief Innovation Officer. Her children were now teenagers, and she felt ready to take on a major role again. Her husband Peter, the Stanford economics professor, fully supported her decision. Sarah's return was celebrated throughout the company, and she brought renewed energy to product development.

Sarah worked closely with Michael Chen, her younger brother who was now Executive Vice President of Engineering. Together they launched several new initiatives, including a partnership with Carnegie Mellon to support research in robotics. Professor Margaret Anderson, though retired, helped facilitate the relationship with her former university. The partnership resulted in several promising projects and created a pipeline of talent from Carnegie Mellon to Zenith.

David Williams, the third co-founder, had been serving as Chief Operating Officer since 2010. He and his wife Emily had three children, all of whom were now attending college. Their eldest daughter, Sophie Williams, was studying computer science at MIT and had interned at Zenith during the summer of 2013. She worked on Daniel Kim's team and made significant contributions to a machine learning project.

In 2015, Zenith Computing celebrated its thirtieth anniversary. The company organized a massive reunion, inviting former employees, early investors, and partners. Alexander Petrov from Sequoia Capital, who had led the seed round thirty years earlier, gave a speech about the company's remarkable journey. Katherine Rodriguez, his former partner who had also invested early, shared stories about the scrappy startup that had become a technology powerhouse.

The event was attended by hundreds of people whose lives had been touched by Zenith Computing. Kevin Zhang, the first employee, brought his wife Amy and their three children. Professor Anderson, now in her eighties, was honored with a lifetime achievement award. The Morrison, Chen, and Williams families all gathered, representing multiple generations connected to the company's story.

Robert Morrison reflected on how a decision made by three graduate students in 1985 had created not just a successful company but an extended family of thousands of people. His wife Jennifer, who had started as a fellow student at Carnegie Mellon and was now a senior vice president at the company, stood beside him. Their children had grown up with Zenith as part of their family identity.

As the company looked toward the future, new challenges and opportunities awaited. The technology landscape had changed dramatically since 1985, but the core values that the founders had established—innovation, collaboration, and perseverance—remained constant. Zenith Computing had survived market crashes, technological disruptions, and fierce competition by staying true to these principles and by building a culture that attracted and retained exceptional talent.

The story of Zenith Computing continued to evolve, with each generation building upon the foundation laid by those who came before. From a small office in Mountain View to a global company with thousands of employees, the journey had been remarkable. And the people—the engineers, managers, investors, advisors, and family members—who had contributed to that journey were the true heart of the company's success.
`;

  console.log('5000-WORD SHORT STORY TEST');
  console.log('='.repeat(80));
  console.log(`Text length: ${text.trim().split(/\s+/).length} words`);
  console.log('='.repeat(80));

  const startTime = Date.now();
  const { entities, relations } = await extractFromSegments('5000-word-test', text);
  const duration = Date.now() - startTime;

  console.log(`\nProcessing time: ${(duration / 1000).toFixed(1)}s (${duration}ms)`);
  console.log(`\nEntities: ${entities.length}`);

  // Group by type
  const byType: Record<string, any[]> = {};
  for (const e of entities) {
    if (!byType[e.type]) byType[e.type] = [];
    byType[e.type].push(e);
  }

  for (const [type, ents] of Object.entries(byType).sort()) {
    console.log(`\n${type} (${ents.length}):`);
    const sorted = ents.sort((a, b) => a.canonical.localeCompare(b.canonical));
    // Limit output to first 20 entities per type for readability
    const toShow = sorted.slice(0, 20);
    for (const e of toShow) {
      console.log(`  - ${e.canonical}`);
    }
    if (sorted.length > 20) {
      console.log(`  ... and ${sorted.length - 20} more`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`Relations: ${relations.length}`);
  console.log('='.repeat(80));

  // Group relations by type
  const relsByType: Record<string, any[]> = {};
  for (const rel of relations) {
    if (!relsByType[rel.pred]) relsByType[rel.pred] = [];
    relsByType[rel.pred].push(rel);
  }

  for (const [pred, rels] of Object.entries(relsByType).sort()) {
    console.log(`\n${pred} (${rels.length}):`);
    const toShow = rels.slice(0, 15);
    for (const rel of toShow) {
      const subj = entities.find(e => e.id === rel.subj)?.canonical || rel.subj.slice(0, 8);
      const obj = entities.find(e => e.id === rel.obj)?.canonical || rel.obj.slice(0, 8);
      console.log(`  ${subj} → ${obj}`);
    }
    if (rels.length > 15) {
      console.log(`  ... and ${rels.length - 15} more`);
    }
  }

  // Statistics
  console.log(`\n${'='.repeat(80)}`);
  console.log('STATISTICS');
  console.log('='.repeat(80));
  const wordCount = text.trim().split(/\s+/).length;
  console.log(`Words: ${wordCount}`);
  console.log(`Entities: ${entities.length}`);
  console.log(`Relations: ${relations.length}`);
  console.log(`Entity types: ${Object.keys(byType).length}`);
  console.log(`Relation types: ${Object.keys(relsByType).length}`);
  console.log(`Entities per 100 words: ${(entities.length / wordCount * 100).toFixed(1)}`);
  console.log(`Relations per 100 words: ${(relations.length / wordCount * 100).toFixed(1)}`);
  console.log(`Processing speed: ${(wordCount / (duration / 1000)).toFixed(0)} words/sec`);
  console.log(`Entity/Relation ratio: ${(entities.length / relations.length).toFixed(2)}`);

  // Comparison with previous tests
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON WITH PREVIOUS TESTS');
  console.log('='.repeat(80));
  console.log('200-word test: 7 relations, 2.4 rels/100 words');
  console.log('800-word test: 19 relations, 2.4 rels/100 words');
  console.log(`This test: ${relations.length} relations, ${(relations.length / wordCount * 100).toFixed(1)} rels/100 words`);

  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
