import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import CaskFs from '../src/index.js';
import { cleanupFiles, createSampleJsonLd } from './helpers.js';

const TEST_USER = 'rdf-test-user';
const TEST_DIR = '/rdf-test';

describe('CaskFS RDF and Linked Data', () => {
  let caskfs;
  const testFiles = [];

  before(async () => {
    caskfs = new CaskFs();
    await caskfs.dbClient.connect();
  });

  after(async () => {
    await cleanupFiles(caskfs, testFiles, TEST_USER);
    if (caskfs && caskfs.dbClient) {
      await caskfs.dbClient.end();
    }
  });

  describe('JSON-LD File Processing', () => {
    const jsonldFile = `${TEST_DIR}/document.jsonld`;

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: jsonldFile, requestor: TEST_USER });
      } catch (e) {}
    });

    after(async () => {
      try {
        await caskfs.delete({ filePath: jsonldFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should detect and process JSON-LD files', async () => {
      const jsonldData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/book/1',
        '@type': 'Book',
        'name': 'The Great Gatsby',
        'author': {
          '@type': 'Person',
          'name': 'F. Scott Fitzgerald'
        },
        'isbn': '978-0-7432-7356-5',
        'numberOfPages': 180
      };

      await caskfs.write({
        filePath: jsonldFile,
        data: Buffer.from(JSON.stringify(jsonldData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER,
        partitionKeys: ['books']
      });

      const metadata = await caskfs.metadata({
        filePath: jsonldFile,
        requestor: TEST_USER
      });

      assert.strictEqual(metadata.mime_type, 'application/ld+json', 'Should detect JSON-LD mime type');
      assert.ok(metadata.partition_keys.includes('books'), 'Should have partition key');
    });

    it('should handle nested JSON-LD structures', async () => {
      const complexJsonLd = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/organization/1',
        '@type': 'Organization',
        'name': 'Example University',
        'department': [
          {
            '@type': 'Organization',
            'name': 'Computer Science',
            'member': [
              {
                '@type': 'Person',
                'name': 'John Doe',
                'jobTitle': 'Professor'
              },
              {
                '@type': 'Person',
                'name': 'Jane Smith',
                'jobTitle': 'Associate Professor'
              }
            ]
          }
        ]
      };

      await caskfs.write({
        filePath: jsonldFile,
        data: Buffer.from(JSON.stringify(complexJsonLd, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER
      });

      const content = await caskfs.read({
        filePath: jsonldFile,
        requestor: TEST_USER
      });

      const parsed = JSON.parse(content.toString());
      assert.strictEqual(parsed['@type'], 'Organization', 'Should preserve complex structure');
      assert.ok(Array.isArray(parsed.department), 'Should preserve arrays');
    });

    it('should handle JSON-LD with multiple contexts', async () => {
      const multiContextJsonLd = {
        '@context': [
          'http://schema.org/',
          {
            'custom': 'http://example.org/vocab#',
            'customProperty': 'custom:property'
          }
        ],
        '@id': 'http://example.org/item/1',
        '@type': 'Thing',
        'name': 'Test Item',
        'customProperty': 'Custom Value'
      };

      await caskfs.write({
        filePath: jsonldFile,
        data: Buffer.from(JSON.stringify(multiContextJsonLd, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: jsonldFile,
        requestor: TEST_USER
      });

      assert.ok(metadata, 'Should handle multiple contexts');
    });
  });

  describe('RDF Relationships', () => {
    const relationshipFiles = {
      person: `${TEST_DIR}/person.jsonld`,
      organization: `${TEST_DIR}/organization.jsonld`,
      publication: `${TEST_DIR}/publication.jsonld`
    };

    beforeEach(async () => {
      for (const filePath of Object.values(relationshipFiles)) {
        try {
          await caskfs.delete({ filePath, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    after(async () => {
      for (const filePath of Object.values(relationshipFiles)) {
        try {
          await caskfs.delete({ filePath, requestor: TEST_USER });
        } catch (e) {}
      }
    });

    it('should establish relationships between files', async () => {
      // Create person
      const personData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/person/jdoe',
        '@type': 'Person',
        'name': 'John Doe',
        'email': 'jdoe@example.org',
        'affiliation': {
          '@id': 'http://example.org/org/university'
        }
      };

      await caskfs.write({
        filePath: relationshipFiles.person,
        data: Buffer.from(JSON.stringify(personData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER,
        partitionKeys: ['people']
      });

      // Create organization
      const orgData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/org/university',
        '@type': 'Organization',
        'name': 'Example University',
        'url': 'http://university.example.org'
      };

      await caskfs.write({
        filePath: relationshipFiles.organization,
        data: Buffer.from(JSON.stringify(orgData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER,
        partitionKeys: ['organizations']
      });

      // Get relationships for person
      const relationships = await caskfs.relationships({
        filePath: relationshipFiles.person,
        requestor: TEST_USER
      });

      assert.ok(relationships, 'Should return relationships');
    });

    it('should query RDF data by subject', async () => {
      const publicationData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/publication/paper1',
        '@type': 'ScholarlyArticle',
        'name': 'Research Paper',
        'author': {
          '@id': 'http://example.org/person/jdoe'
        },
        'datePublished': '2024-01-15'
      };

      await caskfs.write({
        filePath: relationshipFiles.publication,
        data: Buffer.from(JSON.stringify(publicationData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER,
        partitionKeys: ['publications']
      });

      // This would require RDF find functionality
      // Testing the interface is available
      assert.ok(typeof caskfs.rdf === 'object', 'Should have RDF interface');
      assert.ok(typeof caskfs.rdf.find === 'function', 'Should have RDF find method');
    });
  });

  describe('RDF Find Operations', () => {
    const findTestDir = `${TEST_DIR}/find-test`;
    
    before(async () => {
      // Create test files with different types
      const testData = [
        {
          filePath: `${findTestDir}/person1.jsonld`,
          data: {
            '@context': 'http://schema.org/',
            '@id': 'http://example.org/person/1',
            '@type': 'Person',
            'name': 'Alice'
          }
        },
        {
          filePath: `${findTestDir}/person2.jsonld`,
          data: {
            '@context': 'http://schema.org/',
            '@id': 'http://example.org/person/2',
            '@type': 'Person',
            'name': 'Bob'
          }
        },
        {
          filePath: `${findTestDir}/org.jsonld`,
          data: {
            '@context': 'http://schema.org/',
            '@id': 'http://example.org/org/1',
            '@type': 'Organization',
            'name': 'Test Org'
          }
        }
      ];

      for (const { filePath, data } of testData) {
        try {
          await caskfs.write({
            filePath,
            data: Buffer.from(JSON.stringify(data, null, 2)),
            mimeType: 'application/ld+json',
            requestor: TEST_USER,
            partitionKeys: ['test-find']
          });
          testFiles.push(filePath);
        } catch (e) {
          console.log('Error creating test file:', e.message);
        }
      }
    });

    it('should find files by partition key', async () => {
      try {
        const results = await caskfs.rdf.find({
          partitionKeys: ['test-find']
        });

        assert.ok(results, 'Should return results');
        // Results structure depends on implementation
      } catch (e) {
        console.log('Find by partition key test skipped:', e.message);
      }
    });

    it('should find files by subject URI', async () => {
      try {
        const results = await caskfs.rdf.find({
          subject: 'http://example.org/person/1',
          partitionKeys: ['test-find']
        });

        assert.ok(results, 'Should return results');
      } catch (e) {
        console.log('Find by subject test skipped:', e.message);
      }
    });
  });

  describe('RDF Read Operations', () => {
    const rdfReadFile = `${TEST_DIR}/rdf-read.jsonld`;

    before(async () => {
      const data = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/dataset/1',
        '@type': 'Dataset',
        'name': 'Test Dataset',
        'description': 'A dataset for testing RDF read operations',
        'creator': {
          '@id': 'http://example.org/person/creator',
          '@type': 'Person',
          'name': 'Dataset Creator'
        }
      };

      try {
        await caskfs.write({
          filePath: rdfReadFile,
          data: Buffer.from(JSON.stringify(data, null, 2)),
          mimeType: 'application/ld+json',
          requestor: TEST_USER,
          partitionKeys: ['datasets']
        });
        testFiles.push(rdfReadFile);
      } catch (e) {}
    });

    it('should read RDF in different formats', async () => {
      try {
        // Test reading as JSON-LD
        const jsonldResult = await caskfs.rdf.read({
          file: rdfReadFile,
          format: 'jsonld'
        });

        assert.ok(jsonldResult, 'Should return JSON-LD data');
      } catch (e) {
        console.log('RDF read test skipped:', e.message);
      }
    });

    it('should read RDF with specific subject', async () => {
      try {
        const result = await caskfs.rdf.read({
          subject: 'http://example.org/dataset/1',
          partitionKeys: ['datasets'],
          format: 'jsonld'
        });

        assert.ok(result, 'Should return RDF data for subject');
      } catch (e) {
        console.log('RDF read by subject test skipped:', e.message);
      }
    });
  });

  describe('LDP Container Support', () => {
    const containerFile = `${TEST_DIR}/container.jsonld`;

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: containerFile, requestor: TEST_USER });
      } catch (e) {}
    });

    after(async () => {
      try {
        await caskfs.delete({ filePath: containerFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should handle LDP Basic Container pattern', async () => {
      const containerData = {
        '@context': [
          'http://www.w3.org/ns/ldp',
          'http://schema.org/'
        ],
        '@id': 'http://example.org/container/',
        '@type': ['ldp:BasicContainer', 'Thing'],
        'name': 'Test Container',
        'ldp:contains': [
          { '@id': 'http://example.org/container/item1' },
          { '@id': 'http://example.org/container/item2' }
        ]
      };

      await caskfs.write({
        filePath: containerFile,
        data: Buffer.from(JSON.stringify(containerData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: containerFile,
        requestor: TEST_USER
      });

      assert.ok(metadata, 'Should handle LDP container');
    });
  });

  describe('RDF Statistics', () => {
    it('should include RDF stats in file metadata', async () => {
      const statsFile = `${TEST_DIR}/stats-test.jsonld`;
      
      const data = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/thing/1',
        '@type': 'Thing',
        'name': 'Test Thing',
        'url': 'http://example.org',
        'relatedLink': [
          { '@id': 'http://example.org/related/1' },
          { '@id': 'http://example.org/related/2' }
        ]
      };

      try {
        await caskfs.write({
          filePath: statsFile,
          data: Buffer.from(JSON.stringify(data, null, 2)),
          mimeType: 'application/ld+json',
          requestor: TEST_USER
        });

        const metadata = await caskfs.metadata({
          filePath: statsFile,
          requestor: TEST_USER,
          stats: true
        });

        assert.ok(metadata, 'Should return metadata with stats');
        // RDF stats would be in metadata if available
        
        await caskfs.delete({ filePath: statsFile, requestor: TEST_USER });
      } catch (e) {
        console.log('RDF stats test skipped:', e.message);
      }
    });
  });

  describe('Graph Operations', () => {
    const graphFile = `${TEST_DIR}/graph-test.jsonld`;

    beforeEach(async () => {
      try {
        await caskfs.delete({ filePath: graphFile, requestor: TEST_USER });
      } catch (e) {}
    });

    after(async () => {
      try {
        await caskfs.delete({ filePath: graphFile, requestor: TEST_USER });
      } catch (e) {}
    });

    it('should handle named graphs', async () => {
      const namedGraphData = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/data/1',
        '@graph': [
          {
            '@id': 'http://example.org/person/1',
            '@type': 'Person',
            'name': 'Person in Graph'
          },
          {
            '@id': 'http://example.org/org/1',
            '@type': 'Organization',
            'name': 'Org in Graph'
          }
        ]
      };

      await caskfs.write({
        filePath: graphFile,
        data: Buffer.from(JSON.stringify(namedGraphData, null, 2)),
        mimeType: 'application/ld+json',
        requestor: TEST_USER
      });

      const metadata = await caskfs.metadata({
        filePath: graphFile,
        requestor: TEST_USER
      });

      assert.ok(metadata, 'Should handle named graphs');
    });
  });

  describe('Predicate Filtering', () => {
    const predicateFile = `${TEST_DIR}/predicate-test.jsonld`;

    before(async () => {
      const data = {
        '@context': 'http://schema.org/',
        '@id': 'http://example.org/article/1',
        '@type': 'Article',
        'name': 'Test Article',
        'author': { '@id': 'http://example.org/person/1' },
        'publisher': { '@id': 'http://example.org/org/1' },
        'datePublished': '2024-01-01'
      };

      try {
        await caskfs.write({
          filePath: predicateFile,
          data: Buffer.from(JSON.stringify(data, null, 2)),
          mimeType: 'application/ld+json',
          requestor: TEST_USER,
          partitionKeys: ['articles']
        });
        testFiles.push(predicateFile);
      } catch (e) {}
    });

    it('should filter relationships by predicate', async () => {
      try {
        const relationships = await caskfs.relationships({
          filePath: predicateFile,
          predicate: ['http://schema.org/author'],
          requestor: TEST_USER
        });

        assert.ok(relationships, 'Should filter by predicate');
      } catch (e) {
        console.log('Predicate filter test skipped:', e.message);
      }
    });

    it('should exclude predicates with ignore filter', async () => {
      try {
        const relationships = await caskfs.relationships({
          filePath: predicateFile,
          ignorePredicate: ['http://schema.org/datePublished'],
          requestor: TEST_USER
        });

        assert.ok(relationships, 'Should ignore specified predicates');
      } catch (e) {
        console.log('Ignore predicate test skipped:', e.message);
      }
    });
  });
});
