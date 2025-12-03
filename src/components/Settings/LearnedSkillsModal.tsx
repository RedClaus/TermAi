import React, { useState, useEffect } from "react";
import { X, GraduationCap, Search, Calendar, Code } from "lucide-react";
import styles from "./LearnedSkillsModal.module.css";
import { KnowledgeService } from "../../services/KnowledgeService";
import type { Skill } from "../../types/knowledge";

interface LearnedSkillsModalProps {
  onClose: () => void;
}

export const LearnedSkillsModal: React.FC<LearnedSkillsModalProps> = ({
  onClose,
}) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setLoading(true);
    const data = await KnowledgeService.getLatestSkills();
    setSkills(data);
    setLoading(false);
  };

  const filteredSkills = skills.filter((skill) =>
    JSON.stringify(skill).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <GraduationCap size={20} className={styles.icon} />
            <span>Learned Skills</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>Loading skills...</div>
          ) : filteredSkills.length === 0 ? (
            <div className={styles.empty}>
              {search ? "No matches found" : "No skills learned yet"}
            </div>
          ) : (
            <div className={styles.list}>
              {filteredSkills.map((skill) => (
                <div key={skill.id} className={styles.skillCard}>
                  <div className={styles.skillHeader}>
                    <span className={styles.skillType}>Skill</span>
                    <span className={styles.skillDate}>
                      <Calendar size={12} />
                      {new Date(skill.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={styles.skillUseWhen}>
                    <strong>When to use:</strong> {skill.use_when}
                  </div>
                  
                  {skill.tool_sops.map((sop, idx) => (
                    <div key={idx} className={styles.skillCode}>
                      <div className={styles.codeHeader}>
                        <Code size={12} />
                        <span>{sop.tool_name}</span>
                      </div>
                      <pre>{sop.action}</pre>
                    </div>
                  ))}
                  
                  {skill.preferences && (
                    <div className={styles.skillDesc}>{skill.preferences}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
