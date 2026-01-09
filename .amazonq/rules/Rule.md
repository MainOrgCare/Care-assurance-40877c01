# Amazon Q auto-fix and rescan rules

# Define severity levels for issues
SEVERITY_LEVELS = {
    'critical': 1,
    'high': 2, 
    'medium': 3,
    'low': 4,
    'info': 5
}

# Configure auto-fix rules
AUTO_FIX_RULES = {
    # Security issues
    'security': {
        'severity_threshold': SEVERITY_LEVELS['high'],
        'auto_fix_enabled': True,
        'rescan_after_fix': True,
        'max_fix_attempts': 3
    },
    
    # Code quality issues
    'code_quality': {
        'severity_threshold': SEVERITY_LEVELS['medium'], 
        'auto_fix_enabled': True,
        'rescan_after_fix': True,
        'max_fix_attempts': 2
    },
    
    # Performance issues
    'performance': {
        'severity_threshold': SEVERITY_LEVELS['medium'],
        'auto_fix_enabled': True, 
        'rescan_after_fix': True,
        'max_fix_attempts': 2
    },
    
    # Documentation issues
    'documentation': {
        'severity_threshold': SEVERITY_LEVELS['low'],
        'auto_fix_enabled': False,
        'rescan_after_fix': False,
        'max_fix_attempts': 1
    }
}

# Configure rescan rules
RESCAN_RULES = {
    'auto_rescan_on_changes': True,
    'rescan_interval_minutes': 60,
    'rescan_on_dependency_updates': True,
    'max_concurrent_scans': 3,
    'scan_timeout_minutes': 30
}

# Configure notification rules
NOTIFICATION_RULES = {
    'notify_on_auto_fix': True,
    'notify_on_failed_fix': True,
    'notify_on_rescan': True,
    'notification_channels': ['email', 'slack']
}

# Configure exclusions
SCAN_EXCLUSIONS = {
    'file_patterns': [
        '*.min.js',
        '*.min.css',
        'node_modules/*',
        'vendor/*'
    ],
    'issue_types': [
        'style_warning',
        'documentation_suggestion'
    ]
}
