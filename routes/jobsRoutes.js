import express from 'express';
import pool from '../config/db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { uploadResume, getFileUrl, setUploadFolder } from '../middleware/upload.js';
import { uploadToUploadThing } from '../services/uploadthingService.js';
import { generateSeoFiles } from '../services/seoGenerator.js';
import { sendJobApplicationNotification } from '../services/emailService.js';


const router = express.Router();

// Helper to safely parse JSON or return array
function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    return Array.isArray(val) ? val : Object.values(val);
  }
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'string') return [parsed];
    return Object.values(parsed);
  } catch {
    if (typeof val === 'string') {
      return val.split('\n').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }
}

// ==========================================
// PUBLIC: Resume Upload for Applicants
// ==========================================
router.post('/upload-resume', setUploadFolder('jobs'), (req, res) => {
  uploadResume.single('resume')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Resume upload failed.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select a resume file to upload.' });
    }
    try {
      const result = await uploadToUploadThing(req.file, 'jobs');
      return res.json({
        success: true,
        message: 'Resume uploaded successfully.',
        url: result.url,
        filename: result.filename,
        key: result.key,
        provider: result.provider,
        subfolder: 'jobs',
      });
    } catch (uploadErr) {
      console.error('Resume upload error:', uploadErr);
      return res.status(500).json({
        success: false,
        message: uploadErr.message || 'Failed to upload resume.',
      });
    }
  });
});

// ==========================================
// PUBLIC: Get Active Job Listings
// ==========================================
router.get('/', async (req, res) => {
  try {
    const { search, department, location, job_type, page, limit } = req.query;

    let baseQuery = 'WHERE is_active = 1';
    const params = [];

    if (search && search.trim()) {
      baseQuery += ' AND (title LIKE ? OR description LIKE ? OR department LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (department && department !== 'All') {
      baseQuery += ' AND department = ?';
      params.push(department);
    }

    if (location && location !== 'All') {
      baseQuery += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }

    if (job_type && job_type !== 'All') {
      baseQuery += ' AND job_type = ?';
      params.push(job_type);
    }

    const isPaginated = page !== undefined || limit !== undefined;
    let query = `SELECT * FROM jobs ${baseQuery} ORDER BY created_at DESC`;
    let paginationData = null;

    if (isPaginated) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM jobs ${baseQuery}`, params);
      const totalJobs = countResult[0]?.total || 0;
      const totalPages = Math.ceil(totalJobs / limitNum);

      query += ' LIMIT ? OFFSET ?';
      const pagedParams = [...params, limitNum, offset];
      const [rows] = await pool.query(query, pagedParams);

      const jobs = rows.map((job) => ({
        ...job,
        responsibilities: parseJsonArray(job.responsibilities),
        requirements: parseJsonArray(job.requirements),
        benefits: parseJsonArray(job.benefits),
      }));

      return res.json({
        success: true,
        jobs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalJobs,
          totalPages,
        },
      });
    }

    const [rows] = await pool.query(query, params);

    const jobs = rows.map((job) => ({
      ...job,
      responsibilities: parseJsonArray(job.responsibilities),
      requirements: parseJsonArray(job.requirements),
      benefits: parseJsonArray(job.benefits),
    }));

    return res.json({ success: true, jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve jobs.' });
  }
});

// ==========================================
// PUBLIC: Get Single Job Details by Slug or ID
// ==========================================
router.get('/:slugOrId', async (req, res) => {
  try {
    const { slugOrId } = req.params;
    let job;

    if (!isNaN(slugOrId)) {
      const [rows] = await pool.query('SELECT * FROM jobs WHERE id = ?', [parseInt(slugOrId, 10)]);
      job = rows[0];
    } else {
      const [rows] = await pool.query('SELECT * FROM jobs WHERE slug = ?', [slugOrId]);
      job = rows[0];
    }

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job posting not found.' });
    }

    const formatted = {
      ...job,
      responsibilities: parseJsonArray(job.responsibilities),
      requirements: parseJsonArray(job.requirements),
      benefits: parseJsonArray(job.benefits),
    };

    return res.json({ success: true, job: formatted });
  } catch (error) {
    console.error('Error fetching job details:', error);
    return res.status(500).json({ success: false, message: 'Failed to load job details.' });
  }
});

// ==========================================
// PUBLIC: Submit Job Application
// ==========================================
router.post('/:id/apply', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10);
    const {
      applicant_name,
      email,
      phone,
      current_city,
      experience_years,
      notice_period,
      resume_url,
      cover_note,
      linkedin_url,
    } = req.body;

    if (!applicant_name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone number are required.',
      });
    }

    if (!resume_url) {
      return res.status(400).json({
        success: false,
        message: 'Please provide or upload your CV / resume.',
      });
    }

    // Verify job exists
    const [jobs] = await pool.query('SELECT id, title, is_active FROM jobs WHERE id = ?', [jobId]);
    if (jobs.length === 0) {
      return res.status(404).json({ success: false, message: 'The job posting does not exist.' });
    }

    const job = jobs[0];
    if (!job.is_active) {
      return res.status(400).json({ success: false, message: 'This job posting is no longer active.' });
    }

    const [result] = await pool.query(
      `INSERT INTO job_applications 
       (job_id, job_title, applicant_name, email, phone, current_city, experience_years, notice_period, resume_url, cover_note, linkedin_url, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        job.id,
        job.title,
        applicant_name.trim(),
        email.trim().toLowerCase(),
        phone.trim(),
        current_city?.trim() || '',
        experience_years?.trim() || '',
        notice_period?.trim() || 'Immediate',
        resume_url.trim(),
        cover_note?.trim() || '',
        linkedin_url?.trim() || '',
      ]
    );

    // Asynchronously dispatch email notification
    sendJobApplicationNotification({
      jobTitle: job.title,
      applicantName: applicant_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      resumeUrl: resume_url.trim(),
    }).catch((err) => console.warn('Job application email notification error:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Your application has been received successfully! Our HR team will review your profile.',
      applicationId: result.insertId,
    });
  } catch (error) {
    console.error('Error submitting application:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit application. Please try again.' });
  }
});

// ==========================================
// ADMIN: Get All Jobs (Active & Inactive with Application Counts)
// ==========================================
router.get('/admin/all', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      SELECT j.*, 
        COUNT(a.id) AS applications_count,
        SUM(CASE WHEN a.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
      FROM jobs j
      LEFT JOIN job_applications a ON j.id = a.job_id
      GROUP BY j.id
      ORDER BY j.created_at DESC
    `;
    const [rows] = await pool.query(query);

    const jobs = rows.map((job) => ({
      ...job,
      applications_count: parseInt(job.applications_count || 0, 10),
      pending_count: parseInt(job.pending_count || 0, 10),
      responsibilities: parseJsonArray(job.responsibilities),
      requirements: parseJsonArray(job.requirements),
      benefits: parseJsonArray(job.benefits),
    }));

    return res.json({ success: true, jobs });
  } catch (error) {
    console.error('Admin error fetching jobs:', error);
    return res.status(500).json({ success: false, message: 'Failed to load jobs for admin.' });
  }
});

// ==========================================
// ADMIN: Create New Job
// ==========================================
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const {
      title,
      slug,
      department,
      location,
      job_type,
      experience_level,
      salary_range,
      openings,
      deadline,
      description,
      responsibilities,
      requirements,
      benefits,
      is_active,
    } = req.body;

    if (!title || !department || !location || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, department, location, and description are required.',
      });
    }

    // Auto-generate slug if missing
    let finalSlug = slug;
    if (!finalSlug || !finalSlug.trim()) {
      finalSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + '-' + Date.now().toString().slice(-4);
    }

    const [existing] = await pool.query('SELECT id FROM jobs WHERE slug = ?', [finalSlug]);
    if (existing.length > 0) {
      finalSlug = `${finalSlug}-${Math.floor(Math.random() * 1000)}`;
    }

    const respJson = Array.isArray(responsibilities)
      ? JSON.stringify(responsibilities)
      : typeof responsibilities === 'string'
      ? JSON.stringify(responsibilities.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    const reqJson = Array.isArray(requirements)
      ? JSON.stringify(requirements)
      : typeof requirements === 'string'
      ? JSON.stringify(requirements.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    const benJson = Array.isArray(benefits)
      ? JSON.stringify(benefits)
      : typeof benefits === 'string'
      ? JSON.stringify(benefits.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    const [result] = await pool.query(
      `INSERT INTO jobs 
       (slug, title, department, location, job_type, experience_level, salary_range, openings, deadline, description, responsibilities, requirements, benefits, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalSlug,
        (title || '').trim(),
        (department || '').trim(),
        (location || '').trim(),
        job_type?.trim() || 'Full-Time',
        experience_level?.trim() || '1 - 2 Years',
        salary_range?.trim() || '',
        parseInt(openings || 1, 10),
        deadline?.trim() || '',
        (description || '').trim(),
        respJson,
        reqJson,
        benJson,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
      ]
    );

    generateSeoFiles().catch((err) => console.warn('SEO regen on job create failed:', err.message));

    return res.status(201).json({
      success: true,
      message: 'Job posting created successfully.',
      jobId: result.insertId,
      slug: finalSlug,
    });
  } catch (error) {
    console.error('Error creating job:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create job.' });
  }
});

// ==========================================
// ADMIN: Update Job
// ==========================================
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      title,
      slug,
      department,
      location,
      job_type,
      experience_level,
      salary_range,
      openings,
      deadline,
      description,
      responsibilities,
      requirements,
      benefits,
      is_active,
    } = req.body;

    const [existing] = await pool.query('SELECT id FROM jobs WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    const respJson = Array.isArray(responsibilities)
      ? JSON.stringify(responsibilities)
      : typeof responsibilities === 'string'
      ? JSON.stringify(responsibilities.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    const reqJson = Array.isArray(requirements)
      ? JSON.stringify(requirements)
      : typeof requirements === 'string'
      ? JSON.stringify(requirements.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    const benJson = Array.isArray(benefits)
      ? JSON.stringify(benefits)
      : typeof benefits === 'string'
      ? JSON.stringify(benefits.split('\n').map((s) => s.trim()).filter(Boolean))
      : JSON.stringify([]);

    await pool.query(
      `UPDATE jobs SET
        title = ?,
        slug = ?,
        department = ?,
        location = ?,
        job_type = ?,
        experience_level = ?,
        salary_range = ?,
        openings = ?,
        deadline = ?,
        description = ?,
        responsibilities = ?,
        requirements = ?,
        benefits = ?,
        is_active = ?
       WHERE id = ?`,
      [
        (title || '').trim(),
        (slug || '').trim(),
        (department || '').trim(),
        (location || '').trim(),
        job_type?.trim() || 'Full-Time',
        experience_level?.trim() || '1 - 2 Years',
        salary_range?.trim() || '',
        parseInt(openings || 1, 10),
        deadline?.trim() || '',
        (description || '').trim(),
        respJson,
        reqJson,
        benJson,
        is_active ? 1 : 0,
        id,
      ]
    );

    generateSeoFiles().catch((err) => console.warn('SEO regen on job update failed:', err.message));

    return res.json({ success: true, message: 'Job posting updated successfully.' });
  } catch (error) {
    console.error('Error updating job:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to update job.' });
  }
});

// ==========================================
// ADMIN: Toggle Job Active Status
// ==========================================
router.patch('/:id/toggle', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query('SELECT is_active FROM jobs WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    const newStatus = rows[0].is_active ? 0 : 1;
    await pool.query('UPDATE jobs SET is_active = ? WHERE id = ?', [newStatus, id]);

    generateSeoFiles().catch((err) => console.warn('SEO regen on job toggle failed:', err.message));

    return res.json({
      success: true,
      message: `Job is now ${newStatus ? 'active' : 'inactive'}.`,
      is_active: Boolean(newStatus),
    });
  } catch (error) {
    console.error('Error toggling job:', error);
    return res.status(500).json({ success: false, message: 'Failed to update job status.' });
  }
});

// ==========================================
// ADMIN: Delete Job
// ==========================================
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Delete associated applications first
    await pool.query('DELETE FROM job_applications WHERE job_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM jobs WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Job not found.' });
    }

    generateSeoFiles().catch((err) => console.warn('SEO regen on job delete failed:', err.message));

    return res.json({ success: true, message: 'Job posting and associated applications deleted.' });
  } catch (error) {
    console.error('Error deleting job:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete job.' });
  }
});

// ==========================================
// ADMIN: Get Applications (with filters)
// ==========================================
router.get('/admin/applications', authenticateAdmin, async (req, res) => {
  try {
    const { job_id, status, search } = req.query;

    let query = `
      SELECT a.*, j.department AS job_department, j.location AS job_location
      FROM job_applications a
      LEFT JOIN jobs j ON a.job_id = j.id
      WHERE 1=1
    `;
    const params = [];

    if (job_id && job_id !== 'all') {
      query += ' AND a.job_id = ?';
      params.push(parseInt(job_id, 10));
    }

    if (status && status !== 'all') {
      query += ' AND a.status = ?';
      params.push(status);
    }

    if (search && search.trim()) {
      query += ' AND (a.applicant_name LIKE ? OR a.email LIKE ? OR a.phone LIKE ? OR a.job_title LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY a.created_at DESC';

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, applications: rows });
  } catch (error) {
    console.error('Error fetching applications:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve applications.' });
  }
});

// ==========================================
// ADMIN: Get Single Application Details
// ==========================================
router.get('/admin/applications/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.query(
      `SELECT a.*, j.department AS job_department, j.location AS job_location, j.job_type, j.salary_range
       FROM job_applications a
       LEFT JOIN jobs j ON a.job_id = j.id
       WHERE a.id = ?`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    return res.json({ success: true, application: rows[0] });
  } catch (error) {
    console.error('Error fetching application detail:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch application details.' });
  }
});

// ==========================================
// ADMIN: Update Application Status & Notes
// ==========================================
router.patch('/admin/applications/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, admin_notes } = req.body;

    const allowedStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }

    if (admin_notes !== undefined) {
      updates.push('admin_notes = ?');
      params.push(admin_notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update.' });
    }

    params.push(id);
    const [result] = await pool.query(
      `UPDATE job_applications SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    return res.json({ success: true, message: 'Application status updated successfully.' });
  } catch (error) {
    console.error('Error updating application status:', error);
    return res.status(500).json({ success: false, message: 'Failed to update application status.' });
  }
});

// ==========================================
// ADMIN: Delete Application
// ==========================================
router.delete('/admin/applications/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [result] = await pool.query('DELETE FROM job_applications WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Application not found.' });
    }

    return res.json({ success: true, message: 'Application deleted successfully.' });
  } catch (error) {
    console.error('Error deleting application:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete application.' });
  }
});

export default router;
